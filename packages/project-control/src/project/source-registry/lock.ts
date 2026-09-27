import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { UIProjectControlConfig } from "../types";
import {
  AgentUISourceError,
  assertSafeProjectRelativePath,
  resolveAgentUISourceRoots,
} from "./path-policy";
import type { AgentUISourceLock } from "./types";

export const AGENT_UI_SOURCE_LOCK_FILE = "source-lock.json";
export const AGENT_UI_SOURCE_TRANSACTION_FILE = "source-transaction.json";

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function readOptionalBuffer(
  filePath: string,
): Promise<Buffer | undefined> {
  try {
    return await readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function parseLock(value: unknown, sourceRoot: string): AgentUISourceLock {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).schemaVersion !== 1 ||
    (value as Record<string, unknown>).sourceRoot !== sourceRoot
  ) {
    throw new AgentUISourceError(
      "AGENT_UI_SOURCE_LOCK_INVALID",
      "Agent UI source-lock.json is invalid or belongs to another Source Root.",
    );
  }
  const rawItems = (value as Record<string, unknown>).items;
  if (typeof rawItems !== "object" || rawItems === null || Array.isArray(rawItems)) {
    throw new AgentUISourceError(
      "AGENT_UI_SOURCE_LOCK_INVALID",
      "Agent UI source-lock.json must contain an items object.",
    );
  }
  const items: AgentUISourceLock["items"] = {};
  for (const [itemId, rawItem] of Object.entries(rawItems)) {
    if (typeof rawItem !== "object" || rawItem === null || Array.isArray(rawItem)) {
      throw new AgentUISourceError("AGENT_UI_SOURCE_LOCK_INVALID", `Invalid lock item ${itemId}.`);
    }
    const version = (rawItem as Record<string, unknown>).version;
    const rawFiles = (rawItem as Record<string, unknown>).files;
    if (
      typeof version !== "string" ||
      typeof rawFiles !== "object" ||
      rawFiles === null ||
      Array.isArray(rawFiles)
    ) {
      throw new AgentUISourceError("AGENT_UI_SOURCE_LOCK_INVALID", `Invalid lock item ${itemId}.`);
    }
    const files: Record<string, { sha256: string }> = {};
    for (const [filePath, rawFile] of Object.entries(rawFiles)) {
      assertSafeProjectRelativePath(filePath, `source-lock item ${itemId} path`);
      const digest =
        typeof rawFile === "object" && rawFile !== null && !Array.isArray(rawFile)
          ? (rawFile as Record<string, unknown>).sha256
          : undefined;
      if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) {
        throw new AgentUISourceError(
          "AGENT_UI_SOURCE_LOCK_INVALID",
          `Invalid lock hash for ${itemId}:${filePath}.`,
        );
      }
      files[filePath] = { sha256: digest };
    }
    items[itemId] = { version, files };
  }
  return { schemaVersion: 1, sourceRoot, items };
}

export async function readAgentUISourceLock(
  projectRoot: string,
  config: UIProjectControlConfig,
): Promise<{ lock: AgentUISourceLock; source?: Buffer; path: string }> {
  const { metadataRoot } = await resolveAgentUISourceRoots(projectRoot, config);
  const lockPath = path.join(metadataRoot, AGENT_UI_SOURCE_LOCK_FILE);
  const source = await readOptionalBuffer(lockPath);
  if (source === undefined) {
    return {
      lock: { schemaVersion: 1, sourceRoot: config.agentUI.sourceRoot, items: {} },
      path: lockPath,
    };
  }
  try {
    return {
      lock: parseLock(JSON.parse(source.toString("utf8")) as unknown, config.agentUI.sourceRoot),
      source,
      path: lockPath,
    };
  } catch (error) {
    if (error instanceof AgentUISourceError) throw error;
    throw new AgentUISourceError(
      "AGENT_UI_SOURCE_LOCK_INVALID",
      "Agent UI source-lock.json is not valid JSON.",
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

export function serializeAgentUISourceLock(lock: AgentUISourceLock): Buffer {
  const sortedItems = Object.fromEntries(
    Object.entries(lock.items)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([itemId, item]) => [
        itemId,
        {
          version: item.version,
          files: Object.fromEntries(
            Object.entries(item.files).sort(([left], [right]) => left.localeCompare(right)),
          ),
        },
      ]),
  );
  return Buffer.from(
    `${JSON.stringify({ schemaVersion: 1, sourceRoot: lock.sourceRoot, items: sortedItems }, null, 2)}\n`,
  );
}
