import { randomUUID } from "node:crypto";
import path from "node:path";

import type { ExecuteResponse } from "deepagents";
import { createTwoFilesPatch, FILE_HEADERS_ONLY } from "diff";

import type {
  CreatorFileChangeReceipt,
  CreatorRunReceipt,
  CreatorValidationReceipt,
  CreatorVerificationReceipt,
} from "./receiptTypes.js";
import type { CreatorProjectControlMetadata } from "./project-control/types.js";
import { CreatorFileObservationStore } from "./files/CreatorFileObservationStore.js";
import {
  readCreatorFileState,
  resolveCreatorProjectFile,
} from "./files/creatorFileState.js";
import {
  CreatorTransactionStore,
  type CreatorTransactionFileInput,
} from "./transactions/CreatorTransactionStore.js";

const DIFF_CONTEXT_LINES = 3;
const MAX_DIFF_CHARACTERS = 20_000;
const MAX_VALIDATION_OUTPUT_CHARACTERS = 8_000;

function truncate(source: string, limit: number, suffix: string) {
  return source.length <= limit
    ? { text: source, truncated: false }
    : {
        text: `${source.slice(0, limit)}\n${suffix}`,
        truncated: true,
      };
}

function unifiedDiff(
  filePath: string,
  before: string | undefined,
  after: string | undefined,
): { diff: string; truncated: boolean } {
  const patch = createTwoFilesPatch(
    before === undefined ? "/dev/null" : `a/${filePath}`,
    after === undefined ? "/dev/null" : `b/${filePath}`,
    before ?? "",
    after ?? "",
    undefined,
    undefined,
    {
      context: DIFF_CONTEXT_LINES,
      headerOptions: FILE_HEADERS_ONLY,
    },
  ).trimEnd();
  const result = truncate(
    patch,
    MAX_DIFF_CHARACTERS,
    "… Diff 内容过长，已截断",
  );
  return { diff: result.text, truncated: result.truncated };
}

export class CreatorActivityRecorder {
  private readonly projectRoot: string;
  readonly fileObservations: CreatorFileObservationStore;
  readonly transactions: CreatorTransactionStore;
  private readonly beforeByPath = new Map<string, string | undefined>();
  private readonly touchedPaths = new Set<string>();
  private readonly validations: CreatorValidationReceipt[] = [];
  private readonly lastValidationByCommand = new Map<
    string,
    { runId: string; validation: CreatorValidationReceipt }
  >();
  private lastVerification:
    | { runId: string; verification: CreatorVerificationReceipt }
    | undefined;
  private mutationRevision = 0;
  private currentRunId = "unstarted";
  private beforeContentBytes = 0;
  private completedReceipt: CreatorRunReceipt | undefined;
  private verification: CreatorVerificationReceipt = {
    status: "not-run",
    projectRevision: 0,
    auditAttempts: 0,
    checks: [],
  };

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    this.fileObservations = new CreatorFileObservationStore(this.projectRoot);
    this.transactions = new CreatorTransactionStore(this.projectRoot);
  }

  begin(runId: string = randomUUID()): void {
    this.beforeByPath.clear();
    this.touchedPaths.clear();
    this.validations.splice(0);
    this.mutationRevision = 0;
    this.beforeContentBytes = 0;
    this.completedReceipt = undefined;
    this.currentRunId = runId;
    this.fileObservations.begin(runId);
    this.verification = {
      status: "not-run",
      projectRevision: 0,
      auditAttempts: 0,
      checks: [],
    };
  }

  get revision(): number {
    return this.mutationRevision;
  }

  get runId(): string {
    return this.currentRunId;
  }

  get projectRootPath(): string {
    return this.projectRoot;
  }

  async captureBefore(filePath: string): Promise<void> {
    const state = await readCreatorFileState(this.projectRoot, filePath);
    this.captureBeforeContent(filePath, state.content);
  }

  captureBeforeContent(filePath: string, content: string | undefined): void {
    const location = resolveCreatorProjectFile(this.projectRoot, filePath);
    if (this.beforeByPath.has(location.receiptPath)) {
      return;
    }
    // Count the JSON-escaped before payload and its path, not only raw text.
    // Control characters can expand substantially when the journal is encoded.
    const additionalBytes = Buffer.byteLength(
      JSON.stringify({ path: location.receiptPath, content }),
      "utf8",
    );
    this.transactions.assertCaptureBudget(
      this.beforeContentBytes,
      additionalBytes,
      this.beforeByPath.size,
    );
    this.beforeByPath.set(location.receiptPath, content);
    this.beforeContentBytes += additionalBytes;
  }

  touch(filePath: string): void {
    const location = resolveCreatorProjectFile(this.projectRoot, filePath);
    this.touchedPaths.add(location.receiptPath);
    this.mutationRevision += 1;
  }

  recordValidation(command: string, result: ExecuteResponse): void {
    const output = truncate(
      result.output.trim(),
      MAX_VALIDATION_OUTPUT_CHARACTERS,
      "… 验证输出过长，已截断",
    );
    const validation: CreatorValidationReceipt = {
      command,
      status: result.exitCode === 0 ? "passed" : "failed",
      exitCode: result.exitCode,
      output: output.text,
      truncated: result.truncated || output.truncated,
      revision: this.mutationRevision,
    };
    this.validations.push(validation);
    this.lastValidationByCommand.set(command, {
      runId: this.currentRunId,
      validation,
    });
  }

  validationAtCurrentRevision(
    command: string,
  ): CreatorValidationReceipt | undefined {
    return [...this.validations]
      .reverse()
      .find(
        (validation) =>
          validation.command === command &&
          validation.revision === this.mutationRevision,
      );
  }

  recordVerification(verification: CreatorVerificationReceipt): void {
    this.verification = {
      ...verification,
      checks: [...verification.checks],
    };
    this.lastVerification = {
      runId: this.currentRunId,
      verification: this.verification,
    };
  }

  projectControlMetadata(): CreatorProjectControlMetadata {
    const validations = [...this.lastValidationByCommand.values()]
      .sort((left, right) =>
        left.validation.command.localeCompare(right.validation.command),
      )
      .map(({ runId, validation }) => ({
        command: validation.command,
        status: validation.status,
        runId,
        revision: validation.revision ?? 0,
        current:
          runId === this.currentRunId &&
          validation.revision === this.mutationRevision,
      }));
    const lastVerification = this.lastVerification;
    const verification =
      lastVerification === undefined
        ? {
            status: "not-run" as const,
            runId: this.currentRunId,
            revision: this.mutationRevision,
            current: true,
          }
        : {
            status: lastVerification.verification.status,
            runId: lastVerification.runId,
            revision: lastVerification.verification.projectRevision,
            current:
              lastVerification.runId === this.currentRunId &&
              lastVerification.verification.projectRevision ===
                this.mutationRevision,
          };

    return {
      runId: this.currentRunId,
      mutationRevision: this.mutationRevision,
      validations,
      verification,
      runtimeDiagnostics: { available: false },
    };
  }

  async snapshot(): Promise<CreatorRunReceipt> {
    return (await this.collectReceipt()).receipt;
  }

  async finish(): Promise<CreatorRunReceipt> {
    if (this.completedReceipt !== undefined) {
      return structuredClone(this.completedReceipt);
    }
    const collected = await this.collectReceipt();
    const validationRevision = this.validations.some(
      (validation) => validation.revision === this.mutationRevision,
    )
      ? this.mutationRevision
      : null;
    const transaction = await this.transactions.persistRun({
      runId: this.currentRunId,
      mutationRevision: this.mutationRevision,
      validationRevision,
      files: collected.transactionFiles,
    });
    if (transaction === undefined) {
      this.completedReceipt = collected.receipt;
      return structuredClone(this.completedReceipt);
    }
    const status = await this.transactions.status(transaction.runId);
    this.completedReceipt = {
      ...collected.receipt,
      transaction: {
        runId: transaction.runId,
        undoable: status.undoable,
      },
    };
    return structuredClone(this.completedReceipt);
  }

  private async collectReceipt(): Promise<{
    receipt: CreatorRunReceipt;
    transactionFiles: CreatorTransactionFileInput[];
  }> {
    const files: CreatorFileChangeReceipt[] = [];
    const transactionFiles: CreatorTransactionFileInput[] = [];

    for (const filePath of [...this.touchedPaths].sort()) {
      const after = (await readCreatorFileState(this.projectRoot, filePath))
        .content;
      const before = this.beforeByPath.get(filePath);
      if (before === after) {
        continue;
      }

      const diff = unifiedDiff(filePath, before, after);
      const status =
        before === undefined
          ? "created"
          : after === undefined
            ? "deleted"
            : "modified";
      files.push({
        path: filePath,
        status,
        diff: diff.diff,
        truncated: diff.truncated,
      });
      transactionFiles.push({ path: filePath, before, after });
    }

    return {
      receipt: {
        files,
        validations: [...this.validations],
        verification: {
          ...this.verification,
          checks: [...this.verification.checks],
        },
      },
      transactionFiles,
    };
  }
}
