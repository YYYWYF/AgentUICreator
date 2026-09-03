import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  CREATOR_MISSING_FILE_HASH,
  creatorContentHash,
  readCreatorFileState,
  removeCreatorFile,
  replaceCreatorFileAtomically,
  resolveCreatorProjectFile,
  type CreatorFileState,
} from "../files/creatorFileState.js";

export const CREATOR_TRANSACTION_SCHEMA_VERSION = 1 as const;
export const CREATOR_TRANSACTION_DIRECTORY = ".agentuicreator/transactions";
export const MAX_CREATOR_TRANSACTION_BYTES = 5_000_000;
export const MAX_CREATOR_TRANSACTION_FILES = 500;
const TRANSACTION_CONTENT_RESERVE_BYTES = 128_000;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;

export type CreatorTransactionFileStatus = "created" | "modified" | "deleted";

export interface CreatorTransactionFileRecord {
  path: string;
  status: CreatorTransactionFileStatus;
  before: {
    exists: boolean;
    hash: string;
    content?: string | undefined;
  };
  after: {
    exists: boolean;
    hash: string;
  };
}

export interface CreatorTransactionRecord {
  schemaVersion: typeof CREATOR_TRANSACTION_SCHEMA_VERSION;
  runId: string;
  createdAt: string;
  mutationRevision: number;
  validationRevision: number | null;
  files: CreatorTransactionFileRecord[];
}

export interface CreatorTransactionFileInput {
  path: string;
  before: string | undefined;
  after: string | undefined;
}

export interface CreatorTransactionStatus {
  runId: string;
  undoable: boolean;
  conflicts: Array<{
    path: string;
    expectedAfterHash: string;
    actualHash: string;
  }>;
}

export interface CreatorUndoResult {
  runId: string;
  changedPaths: string[];
  record: CreatorTransactionRecord;
}

export interface CreatorUndoTestOptions {
  simulateFailureAfterWrite?: number | undefined;
}

export class CreatorTransactionError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "CreatorTransactionError";
    this.code = code;
    this.details = details;
  }
}

const projectUndoTails = new Map<string, Promise<void>>();

async function withUndoLock<T>(
  projectRoot: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = projectUndoTails.get(projectRoot) ?? Promise.resolve();
  let release = (): void => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  projectUndoTails.set(projectRoot, current);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (projectUndoTails.get(projectRoot) === current) {
      projectUndoTails.delete(projectRoot);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new CreatorTransactionError(
      "CREATOR_TRANSACTION_INVALID",
      `${label} must be a string.`,
    );
  }
  return value;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new CreatorTransactionError(
      "CREATOR_TRANSACTION_INVALID",
      `${label} must be a boolean.`,
    );
  }
  return value;
}

function requiredRevision(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new CreatorTransactionError(
      "CREATOR_TRANSACTION_INVALID",
      `${label} must be a non-negative integer.`,
    );
  }
  return value as number;
}

function fileStateRecord(
  input: unknown,
  label: string,
  includeContent: boolean,
): { exists: boolean; hash: string; content?: string | undefined } {
  if (!isRecord(input)) {
    throw new CreatorTransactionError(
      "CREATOR_TRANSACTION_INVALID",
      `${label} must be an object.`,
    );
  }
  const exists = requiredBoolean(input.exists, `${label}.exists`);
  const hash = requiredString(input.hash, `${label}.hash`);
  if (!HASH_PATTERN.test(hash)) {
    throw new CreatorTransactionError(
      "CREATOR_TRANSACTION_INVALID",
      `${label}.hash is invalid.`,
    );
  }
  const content = input.content;
  if (includeContent && exists && typeof content !== "string") {
    throw new CreatorTransactionError(
      "CREATOR_TRANSACTION_INVALID",
      `${label}.content is required for an existing before state.`,
    );
  }
  if ((!exists || !includeContent) && content !== undefined) {
    throw new CreatorTransactionError(
      "CREATOR_TRANSACTION_INVALID",
      `${label}.content is not allowed for this state.`,
    );
  }
  const actualHash = exists
    ? includeContent
      ? creatorContentHash(content as string)
      : undefined
    : CREATOR_MISSING_FILE_HASH;
  if (actualHash !== undefined && actualHash !== hash) {
    throw new CreatorTransactionError(
      "CREATOR_TRANSACTION_INVALID",
      `${label}.hash does not match its state.`,
    );
  }
  return {
    exists,
    hash,
    ...(typeof content === "string" ? { content } : {}),
  };
}

function parseTransactionRecord(
  input: unknown,
  expectedRunId?: string,
): CreatorTransactionRecord {
  if (!isRecord(input) || input.schemaVersion !== CREATOR_TRANSACTION_SCHEMA_VERSION) {
    throw new CreatorTransactionError(
      "CREATOR_TRANSACTION_INVALID",
      "Creator transaction schema is invalid.",
    );
  }
  const runId = requiredString(input.runId, "transaction.runId");
  if (expectedRunId !== undefined && runId !== expectedRunId) {
    throw new CreatorTransactionError(
      "CREATOR_TRANSACTION_INVALID",
      "Creator transaction runId does not match its lookup key.",
    );
  }
  if (!Array.isArray(input.files) || input.files.length === 0) {
    throw new CreatorTransactionError(
      "CREATOR_TRANSACTION_INVALID",
      "Creator transaction files must be a non-empty array.",
    );
  }
  if (input.files.length > MAX_CREATOR_TRANSACTION_FILES) {
    throw new CreatorTransactionError(
      "CREATOR_TRANSACTION_TOO_LARGE",
      `Creator transaction exceeds ${MAX_CREATOR_TRANSACTION_FILES} files.`,
    );
  }
  const files = input.files.map((value, index): CreatorTransactionFileRecord => {
    if (!isRecord(value)) {
      throw new CreatorTransactionError(
        "CREATOR_TRANSACTION_INVALID",
        `transaction.files[${index}] must be an object.`,
      );
    }
    const status = value.status;
    if (status !== "created" && status !== "modified" && status !== "deleted") {
      throw new CreatorTransactionError(
        "CREATOR_TRANSACTION_INVALID",
        `transaction.files[${index}].status is invalid.`,
      );
    }
    const before = fileStateRecord(
      value.before,
      `transaction.files[${index}].before`,
      true,
    );
    const after = fileStateRecord(
      value.after,
      `transaction.files[${index}].after`,
      false,
    );
    const expectedStatus =
      !before.exists && after.exists
        ? "created"
        : before.exists && !after.exists
          ? "deleted"
          : before.exists && after.exists
            ? "modified"
            : undefined;
    if (expectedStatus !== status) {
      throw new CreatorTransactionError(
        "CREATOR_TRANSACTION_INVALID",
        `transaction.files[${index}].status does not match its states.`,
      );
    }
    return {
      path: requiredString(value.path, `transaction.files[${index}].path`),
      status,
      before,
      after,
    };
  });
  const uniquePaths = new Set(files.map((file) => file.path));
  if (uniquePaths.size !== files.length) {
    throw new CreatorTransactionError(
      "CREATOR_TRANSACTION_INVALID",
      "Creator transaction contains duplicate file paths.",
    );
  }
  const validationRevision = input.validationRevision;
  const parsedValidationRevision =
    validationRevision === null
      ? null
      : requiredRevision(
          validationRevision,
          "transaction.validationRevision",
        );
  return {
    schemaVersion: CREATOR_TRANSACTION_SCHEMA_VERSION,
    runId,
    createdAt: requiredString(input.createdAt, "transaction.createdAt"),
    mutationRevision: requiredRevision(
      input.mutationRevision,
      "transaction.mutationRevision",
    ),
    validationRevision: parsedValidationRevision,
    files,
  };
}

function transactionFileName(runId: string): string {
  return `${createHash("sha256").update(runId).digest("hex")}.json`;
}

function stateFromContent(content: string | undefined): {
  exists: boolean;
  hash: string;
  content?: string | undefined;
} {
  return content === undefined
    ? { exists: false, hash: CREATOR_MISSING_FILE_HASH }
    : { exists: true, hash: creatorContentHash(content), content };
}

function transactionStatus(
  before: string | undefined,
  after: string | undefined,
): CreatorTransactionFileStatus {
  if (before === undefined) {
    return "created";
  }
  if (after === undefined) {
    return "deleted";
  }
  return "modified";
}

export class CreatorTransactionStore {
  private readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  assertCaptureBudget(
    currentContentBytes: number,
    additionalContentBytes: number,
    observedFileCount: number,
  ): void {
    if (observedFileCount >= MAX_CREATOR_TRANSACTION_FILES) {
      throw new CreatorTransactionError(
        "CREATOR_TRANSACTION_TOO_LARGE",
        `Creator run cannot capture more than ${MAX_CREATOR_TRANSACTION_FILES} files for safe undo.`,
      );
    }
    if (
      currentContentBytes + additionalContentBytes >
      MAX_CREATOR_TRANSACTION_BYTES - TRANSACTION_CONTENT_RESERVE_BYTES
    ) {
      throw new CreatorTransactionError(
        "CREATOR_TRANSACTION_TOO_LARGE",
        `Creator run before-state content exceeds the ${MAX_CREATOR_TRANSACTION_BYTES} byte transaction limit.`,
      );
    }
  }

  async persistRun(input: {
    runId: string;
    mutationRevision: number;
    validationRevision: number | null;
    files: CreatorTransactionFileInput[];
  }): Promise<CreatorTransactionRecord | undefined> {
    const changedFiles = input.files
      .filter((file) => file.before !== file.after)
      .sort((left, right) => left.path.localeCompare(right.path));
    if (changedFiles.length === 0) {
      return undefined;
    }
    const record: CreatorTransactionRecord = {
      schemaVersion: CREATOR_TRANSACTION_SCHEMA_VERSION,
      runId: input.runId,
      createdAt: new Date().toISOString(),
      mutationRevision: input.mutationRevision,
      validationRevision: input.validationRevision,
      files: changedFiles.map((file) => {
        const before = stateFromContent(file.before);
        const after = stateFromContent(file.after);
        return {
          path: resolveCreatorProjectFile(this.projectRoot, file.path).receiptPath,
          status: transactionStatus(file.before, file.after),
          before,
          after: { exists: after.exists, hash: after.hash },
        };
      }),
    };
    const source = `${JSON.stringify(record, null, 2)}\n`;
    if (Buffer.byteLength(source, "utf8") > MAX_CREATOR_TRANSACTION_BYTES) {
      throw new CreatorTransactionError(
        "CREATOR_TRANSACTION_TOO_LARGE",
        `Creator transaction exceeds ${MAX_CREATOR_TRANSACTION_BYTES} bytes.`,
      );
    }
    await this.ensureDirectory();
    await replaceCreatorFileAtomically(
      this.projectRoot,
      `${CREATOR_TRANSACTION_DIRECTORY}/${transactionFileName(input.runId)}`,
      source,
    );
    return record;
  }

  async load(runId: string): Promise<CreatorTransactionRecord> {
    const relativePath = `${CREATOR_TRANSACTION_DIRECTORY}/${transactionFileName(runId)}`;
    let source: string;
    try {
      source = await readFile(
        resolveCreatorProjectFile(this.projectRoot, relativePath).absolutePath,
        "utf8",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new CreatorTransactionError(
          "CREATOR_TRANSACTION_NOT_FOUND",
          `No Creator transaction exists for run "${runId}".`,
        );
      }
      throw error;
    }
    if (Buffer.byteLength(source, "utf8") > MAX_CREATOR_TRANSACTION_BYTES) {
      throw new CreatorTransactionError(
        "CREATOR_TRANSACTION_TOO_LARGE",
        `Creator transaction exceeds ${MAX_CREATOR_TRANSACTION_BYTES} bytes.`,
      );
    }
    try {
      return parseTransactionRecord(JSON.parse(source) as unknown, runId);
    } catch (error) {
      if (error instanceof CreatorTransactionError) {
        throw error;
      }
      throw new CreatorTransactionError(
        "CREATOR_TRANSACTION_INVALID",
        `Creator transaction for run "${runId}" is invalid.`,
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  async status(runId: string): Promise<CreatorTransactionStatus> {
    const record = await this.load(runId);
    const conflicts: CreatorTransactionStatus["conflicts"] = [];
    for (const file of record.files) {
      const current = await readCreatorFileState(this.projectRoot, file.path);
      if (
        current.exists !== file.after.exists ||
        current.hash !== file.after.hash
      ) {
        conflicts.push({
          path: file.path,
          expectedAfterHash: file.after.hash,
          actualHash: current.hash,
        });
      }
    }
    return { runId, undoable: conflicts.length === 0, conflicts };
  }

  async latestUndoable(excludeRunId?: string): Promise<CreatorTransactionRecord> {
    const directory = path.join(this.projectRoot, CREATOR_TRANSACTION_DIRECTORY);
    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        entries = [];
      } else {
        throw error;
      }
    }
    const records: CreatorTransactionRecord[] = [];
    for (const entry of entries.filter((item) => item.endsWith(".json"))) {
      const source = await readFile(path.join(directory, entry), "utf8");
      const record = parseTransactionRecord(JSON.parse(source) as unknown);
      if (record.runId !== excludeRunId) {
        records.push(record);
      }
    }
    records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    for (const record of records) {
      if ((await this.status(record.runId)).undoable) {
        return record;
      }
    }
    throw new CreatorTransactionError(
      "CREATOR_TRANSACTION_NOT_FOUND",
      "No undoable Creator run is available.",
    );
  }

  async undo(
    requestedRunId?: string,
    options: CreatorUndoTestOptions = {},
  ): Promise<CreatorUndoResult> {
    return withUndoLock(this.projectRoot, async () => {
      const record =
        requestedRunId === undefined
          ? await this.latestUndoable()
          : await this.load(requestedRunId);
      const currentStates = new Map<string, CreatorFileState>();
      const conflicts: CreatorTransactionStatus["conflicts"] = [];
      for (const file of record.files) {
        const current = await readCreatorFileState(this.projectRoot, file.path);
        currentStates.set(file.path, current);
        if (
          current.exists !== file.after.exists ||
          current.hash !== file.after.hash
        ) {
          conflicts.push({
            path: file.path,
            expectedAfterHash: file.after.hash,
            actualHash: current.hash,
          });
        }
      }
      if (conflicts.length > 0) {
        throw new CreatorTransactionError(
          "CREATOR_UNDO_CONFLICT",
          `Creator run "${record.runId}" cannot be undone because project files changed afterward.`,
          { conflicts },
        );
      }

      // Recheck every target immediately before the first write. A conflict here
      // still guarantees that undo performs zero writes.
      for (const file of record.files) {
        const current = await readCreatorFileState(this.projectRoot, file.path);
        if (
          current.exists !== file.after.exists ||
          current.hash !== file.after.hash
        ) {
          throw new CreatorTransactionError(
            "CREATOR_UNDO_CONFLICT",
            `Creator run "${record.runId}" changed during undo preflight.`,
            { path: file.path },
          );
        }
      }

      const applied: CreatorTransactionFileRecord[] = [];
      try {
        for (const file of record.files) {
          const expected = currentStates.get(file.path)!;
          if (file.before.exists) {
            await replaceCreatorFileAtomically(
              this.projectRoot,
              file.path,
              file.before.content!,
              expected,
            );
          } else {
            await removeCreatorFile(this.projectRoot, file.path, expected);
          }
          applied.push(file);
          if (options.simulateFailureAfterWrite === applied.length) {
            throw new Error("Simulated Creator undo failure");
          }
        }
      } catch (error) {
        try {
          for (const file of [...applied].reverse()) {
            const original = currentStates.get(file.path)!;
            const revertedState: CreatorFileState = file.before.exists
              ? {
                  exists: true,
                  hash: file.before.hash,
                  content: file.before.content,
                }
              : {
                  exists: false,
                  hash: CREATOR_MISSING_FILE_HASH,
                };
            if (original.exists) {
              await replaceCreatorFileAtomically(
                this.projectRoot,
                file.path,
                original.content!,
                revertedState,
              );
            } else {
              await removeCreatorFile(
                this.projectRoot,
                file.path,
                revertedState,
              );
            }
          }
        } catch (rollbackError) {
          throw new CreatorTransactionError(
            "CREATOR_UNDO_ROLLBACK_FAILED",
            `Creator run "${record.runId}" undo failed and rollback was incomplete.`,
            {
              cause: error instanceof Error ? error.message : String(error),
              rollbackCause:
                rollbackError instanceof Error
                  ? rollbackError.message
                  : String(rollbackError),
            },
          );
        }
        throw error;
      }
      return {
        runId: record.runId,
        changedPaths: record.files.map((file) => file.path).sort(),
        record,
      };
    });
  }

  private async ensureDirectory(): Promise<void> {
    const creatorDirectory = path.join(this.projectRoot, ".agentuicreator");
    await mkdir(path.join(this.projectRoot, CREATOR_TRANSACTION_DIRECTORY), {
      recursive: true,
    });
    await writeFile(path.join(creatorDirectory, ".gitignore"), "*\n", {
      encoding: "utf8",
      flag: "wx",
    }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") {
        throw error;
      }
    });
  }
}
