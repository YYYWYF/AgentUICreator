import type {
  ConversationJobProgressOutcome,
  JobProgressStage,
} from "@agent-ui/react";

export interface JobProgressRuntimeState {
  readonly stageIndex: number;
  readonly stageProgress: number;
  readonly eta: string;
}

export interface RunCiJobArgs {
  readonly target: string;
  readonly stages: readonly JobProgressStage[];
}

export interface RunCiJobResultView {
  readonly outcome: ConversationJobProgressOutcome | null;
  readonly elapsedMs?: number | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function projectJobProgressState(
  state: unknown,
  toolCallId: string,
): JobProgressRuntimeState | null {
  if (!isRecord(state) || !isRecord(state.jobs)) return null;

  const job = state.jobs[toolCallId];
  if (
    !isRecord(job) ||
    !isFiniteNumber(job.stageIndex) ||
    !isFiniteNumber(job.stageProgress) ||
    typeof job.eta !== "string"
  ) {
    return null;
  }

  return {
    stageIndex: job.stageIndex,
    stageProgress: job.stageProgress,
    eta: job.eta,
  };
}

export function projectRunCiJobArgs(args: unknown): RunCiJobArgs | null {
  if (!isRecord(args)) return null;
  const target = args.target;
  if (typeof target !== "string" || target.trim() === "") {
    return null;
  }
  if (!Array.isArray(args.stages)) return null;

  const stages: JobProgressStage[] = [];
  for (const stage of args.stages) {
    if (
      !isRecord(stage) ||
      typeof stage.name !== "string" ||
      stage.name.trim() === "" ||
      !isFiniteNumber(stage.weight) ||
      (stage.description !== undefined && typeof stage.description !== "string")
    ) {
      return null;
    }
    stages.push({
      name: stage.name,
      weight: stage.weight,
      ...(stage.description === undefined ? {} : { description: stage.description }),
    });
  }

  return { target, stages };
}

const terminalOutcomes = new Set<ConversationJobProgressOutcome["status"]>([
  "success",
  "partial",
  "failed",
  "cancelled",
]);

function parseResultRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isRecord(value) ? value : null;
}

/** Reads terminal job facts only from the explicit Tool Result payload. */
export function projectRunCiJobResult(value: unknown): RunCiJobResultView {
  const result = parseResultRecord(value);
  if (result === null) return { outcome: null };

  const nestedOutcome = isRecord(result.outcome) ? result.outcome : undefined;
  const explicitStatus = nestedOutcome?.status ?? result.status;
  let status: ConversationJobProgressOutcome["status"] | undefined;
  if (
    typeof explicitStatus === "string" &&
    terminalOutcomes.has(explicitStatus as ConversationJobProgressOutcome["status"])
  ) {
    status = explicitStatus as ConversationJobProgressOutcome["status"];
  } else if (result.success === true) {
    status = "success";
  } else if (result.success === false) {
    status = "failed";
  }

  const summaryValue = nestedOutcome?.summary ?? result.summary;
  const outcome = status === undefined
    ? null
    : {
        status,
        ...(typeof summaryValue === "string" ? { summary: summaryValue } : {}),
      };
  const elapsedMs = isFiniteNumber(result.elapsedMs) && result.elapsedMs >= 0
    ? result.elapsedMs
    : undefined;

  return {
    outcome,
    ...(elapsedMs === undefined ? {} : { elapsedMs }),
  };
}
