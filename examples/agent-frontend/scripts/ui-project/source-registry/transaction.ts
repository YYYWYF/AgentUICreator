import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { UIProjectControlConfig } from "../types";
import {
  AGENT_UI_SOURCE_LOCK_FILE,
  AGENT_UI_SOURCE_TRANSACTION_FILE,
  readOptionalBuffer,
} from "./lock";
import {
  AgentUISourceError,
  assertNoSymbolicLinkTraversal,
  assertSafeProjectRelativePath,
  resolveAgentUISourceRoots,
} from "./path-policy";
import type { AgentUISourceTransactionJournal } from "./types";

export interface AgentUISourceFileMutation {
  target: string;
  content?: Buffer;
}

export interface AgentUISourceTransactionTestOptions {
  simulateCrashAfterMutation?: number;
}

class SimulatedAgentUISourceCrash extends Error {}

async function atomicWrite(filePath: string, content: Buffer): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, content);
    await rename(temporaryPath, filePath);
  } finally {
    await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

async function removeOptional(filePath: string): Promise<void> {
  await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

function parseJournal(value: unknown): AgentUISourceTransactionJournal {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Journal must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    typeof record.itemId !== "string" ||
    typeof record.targetVersion !== "string" ||
    !Array.isArray(record.originals) ||
    !(typeof record.lockContentBase64 === "string" || record.lockContentBase64 === null)
  ) {
    throw new Error("Journal shape is invalid.");
  }
  const originals = record.originals.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Journal original is invalid.");
    }
    const original = entry as Record<string, unknown>;
    if (
      typeof original.path !== "string" ||
      !(typeof original.contentBase64 === "string" || original.contentBase64 === null)
    ) {
      throw new Error("Journal original is invalid.");
    }
    assertSafeProjectRelativePath(original.path, "Agent UI transaction path");
    return { path: original.path, contentBase64: original.contentBase64 };
  });
  if (new Set(originals.map((entry) => entry.path)).size !== originals.length) {
    throw new Error("Journal contains duplicate paths.");
  }
  return {
    schemaVersion: 1,
    itemId: record.itemId,
    targetVersion: record.targetVersion,
    originals,
    lockContentBase64: record.lockContentBase64,
  };
}

export async function recoverPendingAgentUISourceTransaction(
  projectRoot: string,
  config: UIProjectControlConfig,
): Promise<void> {
  const { sourceRoot, metadataRoot } = await resolveAgentUISourceRoots(projectRoot, config);
  const journalPath = path.join(metadataRoot, AGENT_UI_SOURCE_TRANSACTION_FILE);
  const journalSource = await readOptionalBuffer(journalPath);
  if (journalSource === undefined) return;
  let journal: AgentUISourceTransactionJournal;
  try {
    journal = parseJournal(JSON.parse(journalSource.toString("utf8")) as unknown);
  } catch (error) {
    throw new AgentUISourceError(
      "AGENT_UI_SOURCE_TRANSACTION_JOURNAL_INVALID",
      "The pending Agent UI source transaction journal is invalid; refusing recovery.",
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }

  try {
    for (const original of journal.originals) {
      await assertNoSymbolicLinkTraversal(sourceRoot, original.path);
      const targetPath = path.join(sourceRoot, original.path);
      if (original.contentBase64 === null) {
        await removeOptional(targetPath);
      } else {
        await atomicWrite(targetPath, Buffer.from(original.contentBase64, "base64"));
      }
    }
    const lockPath = path.join(metadataRoot, AGENT_UI_SOURCE_LOCK_FILE);
    if (journal.lockContentBase64 === null) {
      await removeOptional(lockPath);
    } else {
      await atomicWrite(lockPath, Buffer.from(journal.lockContentBase64, "base64"));
    }
    await removeOptional(journalPath);
  } catch (error) {
    throw new AgentUISourceError(
      "AGENT_UI_SOURCE_TRANSACTION_RECOVERY_FAILED",
      "The pending Agent UI source transaction could not be recovered.",
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

export async function commitAgentUISourceTransaction(
  projectRoot: string,
  config: UIProjectControlConfig,
  itemId: string,
  targetVersion: string,
  mutations: AgentUISourceFileMutation[],
  nextLock: Buffer,
  options: AgentUISourceTransactionTestOptions = {},
): Promise<void> {
  const { sourceRoot, metadataRoot } = await resolveAgentUISourceRoots(projectRoot, config, {
    createMetadata: true,
  });
  const journalPath = path.join(metadataRoot, AGENT_UI_SOURCE_TRANSACTION_FILE);
  if ((await readOptionalBuffer(journalPath)) !== undefined) {
    throw new AgentUISourceError(
      "AGENT_UI_SOURCE_TRANSACTION_PENDING",
      "A pending Agent UI source transaction must be recovered before mutation.",
    );
  }
  const originals = [];
  for (const mutation of mutations) {
    await assertNoSymbolicLinkTraversal(sourceRoot, mutation.target);
    const content = await readOptionalBuffer(path.join(sourceRoot, mutation.target));
    originals.push({
      path: mutation.target,
      contentBase64: content?.toString("base64") ?? null,
    });
  }
  const previousLock = await readOptionalBuffer(path.join(metadataRoot, AGENT_UI_SOURCE_LOCK_FILE));
  const journal: AgentUISourceTransactionJournal = {
    schemaVersion: 1,
    itemId,
    targetVersion,
    originals,
    lockContentBase64: previousLock?.toString("base64") ?? null,
  };
  await atomicWrite(journalPath, Buffer.from(`${JSON.stringify(journal, null, 2)}\n`));

  try {
    let mutationCount = 0;
    for (const mutation of mutations) {
      const targetPath = path.join(sourceRoot, mutation.target);
      if (mutation.content === undefined) await removeOptional(targetPath);
      else await atomicWrite(targetPath, mutation.content);
      mutationCount += 1;
      if (options.simulateCrashAfterMutation === mutationCount) {
        throw new SimulatedAgentUISourceCrash("Simulated Agent UI source transaction crash.");
      }
    }
    const lockPath = path.join(metadataRoot, AGENT_UI_SOURCE_LOCK_FILE);
    await atomicWrite(lockPath, nextLock);
    for (const mutation of mutations) {
      const actual = await readOptionalBuffer(path.join(sourceRoot, mutation.target));
      if (
        (mutation.content === undefined && actual !== undefined) ||
        (mutation.content !== undefined && !actual?.equals(mutation.content))
      ) {
        throw new AgentUISourceError(
          "AGENT_UI_SOURCE_TRANSACTION_VERIFY_FAILED",
          `Failed to verify Agent UI source target ${mutation.target}.`,
        );
      }
    }
    if (!(await readFile(lockPath)).equals(nextLock)) {
      throw new AgentUISourceError(
        "AGENT_UI_SOURCE_TRANSACTION_VERIFY_FAILED",
        "Failed to verify Agent UI source-lock.json.",
      );
    }
    await removeOptional(journalPath);
  } catch (error) {
    if (error instanceof SimulatedAgentUISourceCrash) throw error;
    try {
      await recoverPendingAgentUISourceTransaction(projectRoot, config);
    } catch (rollbackError) {
      throw new AgentUISourceError(
        "AGENT_UI_SOURCE_TRANSACTION_ROLLBACK_FAILED",
        "Agent UI source mutation failed and rollback did not complete.",
        {
          cause: error instanceof Error ? error.message : String(error),
          rollbackCause: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        },
      );
    }
    throw error;
  }
}
