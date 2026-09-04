import type { CreatorActivityRecorder } from "../CreatorActivityRecorder.js";
import {
  CreatorCommandRunner,
  type CreatorCommandExecutor,
} from "../CreatorCommandRunner.js";
import type { CreatorRunLogger } from "../CreatorRunLogger.js";
import type { CreatorValidationReceipt } from "../receiptTypes.js";
import {
  CREATOR_COMPLETION_VALIDATIONS,
  type CreatorValidationCheck,
  type CreatorValidationResult,
} from "./types.js";

const MAX_VALIDATION_FAILURE_OUTPUT_CHARACTERS = 12_000;

export interface CreatorValidationServiceOptions {
  projectRoot: string;
  activity: CreatorActivityRecorder;
  runner?: CreatorCommandExecutor | undefined;
  runLogger?: Pick<CreatorRunLogger, "record"> | undefined;
}

function checkFromReceipt(
  validation: CreatorValidationReceipt,
  source: CreatorValidationCheck["source"],
  revision: number,
): CreatorValidationCheck {
  return {
    command: validation.command as CreatorValidationCheck["command"],
    status: validation.status,
    exitCode: validation.exitCode,
    output: validation.output,
    truncated: validation.truncated,
    revision: validation.revision ?? revision,
    source,
  };
}

function boundedOutput(output: string, truncated: boolean) {
  const normalized = output.trim();
  if (normalized.length <= MAX_VALIDATION_FAILURE_OUTPUT_CHARACTERS) {
    return { output: normalized, truncated };
  }
  return {
    output: `${normalized.slice(0, MAX_VALIDATION_FAILURE_OUTPUT_CHARACTERS)}\n… Host validation output truncated`,
    truncated: true,
  };
}

export class CreatorValidationService {
  private readonly activity: CreatorActivityRecorder;
  private readonly runner: CreatorCommandExecutor;
  private readonly runLogger: Pick<CreatorRunLogger, "record"> | undefined;

  constructor({
    projectRoot,
    activity,
    runner,
    runLogger,
  }: CreatorValidationServiceOptions) {
    this.activity = activity;
    this.runner =
      runner ?? new CreatorCommandRunner({ projectRoot, activity });
    this.runLogger = runLogger;
  }

  async ensureCurrentRevisionValidated(
    options: { signal?: AbortSignal | undefined } = {},
  ): Promise<CreatorValidationResult> {
    const targetRevision = this.activity.revision;
    const checks: CreatorValidationCheck[] = [];
    let cachedCount = 0;
    let executedCount = 0;
    await this.runLogger?.record("host_validation_started", {
      revision: targetRevision,
      commands: CREATOR_COMPLETION_VALIDATIONS,
    });

    for (const command of CREATOR_COMPLETION_VALIDATIONS) {
      if (this.activity.revision !== targetRevision) {
        break;
      }
      const existing = this.activity.validationAtRevision(
        command,
        targetRevision,
      );
      if (existing !== undefined) {
        cachedCount += 1;
        checks.push(checkFromReceipt(existing, "cached", targetRevision));
        continue;
      }

      executedCount += 1;
      const result = await this.runner.executeKnownCommand(command, options);
      const recorded = this.activity.validationAtRevision(
        command,
        targetRevision,
      );
      if (recorded !== undefined) {
        checks.push(checkFromReceipt(recorded, "executed", targetRevision));
      } else {
        const evidence = boundedOutput(result.output, result.truncated);
        checks.push({
          command,
          status: result.exitCode === 0 ? "passed" : "failed",
          exitCode: result.exitCode,
          output: evidence.output,
          truncated: evidence.truncated,
          revision: targetRevision,
          source: "executed",
        });
      }
      if (this.activity.revision !== targetRevision) {
        break;
      }
    }

    const status =
      this.activity.revision !== targetRevision
        ? "stale"
        : checks.every((check) => check.status === "passed")
          ? "passed"
          : "failed";
    const validation: CreatorValidationResult = {
      revision: targetRevision,
      status,
      checks,
    };
    await this.runLogger?.record("host_validation_finished", {
      revision: targetRevision,
      status,
      commands: checks.map(({ command, status: checkStatus, source }) => ({
        command,
        status: checkStatus,
        source,
      })),
      cachedCount,
      executedCount,
    });
    return validation;
  }
}
