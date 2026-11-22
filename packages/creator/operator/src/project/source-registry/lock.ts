import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { UIOperatorConfig } from "../types";
import {
  AgentUISourceError,
  assertSafeProjectRelativePath,
  resolveAgentUISourceRoots,
} from "./path-policy";
import type { AgentUISourceLock } from "./types";

const LEGACY_SOURCE_ITEM_IDS: Readonly<Record<string, string>> = {
  "agent-component/generative-ui": "integration/generative-ui",
  "agent-component/assistant-ui-generative-ui": "integration/generative-ui",
};

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
    Object.keys(value).some(key => !["sourceRoot", "items", "examples"].includes(key)) ||
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
    const rawFiles = (rawItem as Record<string, unknown>).files;
    if (
      typeof rawFiles !== "object" ||
      rawFiles === null ||
      Array.isArray(rawFiles)
    ) {
      throw new AgentUISourceError("AGENT_UI_SOURCE_LOCK_INVALID", `Invalid lock item ${itemId}.`);
    }
    const files: Record<string, Record<string, never>> = {};
    for (const filePath of Object.keys(rawFiles)) {
      assertSafeProjectRelativePath(filePath, `source-lock item ${itemId} path`);
      // Historical hashes and release identities do not describe current files.
      files[filePath] = {};
    }
    const canonicalItemId = LEGACY_SOURCE_ITEM_IDS[itemId] ?? itemId;
    const raw = rawItem as Record<string, unknown>;
    items[canonicalItemId] = {
      ...items[canonicalItemId],
      ...(typeof raw.pluginVersion === "string" ? { pluginVersion: raw.pluginVersion } : {}),
      ...(typeof raw.sourceRelease === "string" ? { sourceRelease: raw.sourceRelease } : {}),
      files: { ...items[canonicalItemId]?.files, ...files },
    };
  }
  const examples: NonNullable<AgentUISourceLock["examples"]> = {};
  const rawExamples = (value as Record<string, unknown>).examples;
  if (rawExamples !== undefined && (!rawExamples || typeof rawExamples !== "object" || Array.isArray(rawExamples))) throw new AgentUISourceError("AGENT_UI_SOURCE_LOCK_INVALID", "Invalid example installation records.");
  for (const [id, record] of Object.entries(rawExamples ?? {})) {
    const files = (record as { files?: unknown } | null)?.files;
    if (!id.startsWith("demo/") || !Array.isArray(files) || files.some(file => typeof file !== "string")) throw new AgentUISourceError("AGENT_UI_SOURCE_LOCK_INVALID", "Invalid example installation record.");
    assertSafeProjectRelativePath(id, "Example id");
    for (const file of files) assertSafeProjectRelativePath(file, "Example target");
    examples[id] = { files: [...new Set(files)].sort() };
  }
  // Older examples used ordinary source hashes. Preserve their files and identity,
  // but stop treating those hashes as an official source baseline.
  for (const [id, item] of Object.entries(items)) if (id.startsWith("demo/")) {
    assertSafeProjectRelativePath(id, "Example id");
    examples[id] = { files: [...new Set([...(examples[id]?.files ?? []), ...Object.keys(item.files)])].sort() };
    delete items[id];
  }
  return { sourceRoot, items, ...(Object.keys(examples).length ? { examples } : {}) };
}

export async function readAgentUISourceLock(
  projectRoot: string,
  config: UIOperatorConfig,
): Promise<{ lock: AgentUISourceLock; source?: Buffer; path: string }> {
  const { metadataRoot } = await resolveAgentUISourceRoots(projectRoot, config);
  const lockPath = path.join(metadataRoot, AGENT_UI_SOURCE_LOCK_FILE);
  const source = await readOptionalBuffer(lockPath);
  if (source === undefined) {
    return {
      lock: { sourceRoot: config.agentUI.sourceRoot, items: {} },
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
          ...(item.pluginVersion ? { pluginVersion: item.pluginVersion } : {}),
          ...(item.sourceRelease ? { sourceRelease: item.sourceRelease } : {}),
          files: Object.fromEntries(
            Object.keys(item.files).sort().map(file => [file, {}]),
          ),
        },
      ]),
  );
  const examples = Object.fromEntries(Object.entries(lock.examples ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, record]) => [id, { files: [...record.files].sort() }]));
  return Buffer.from(`${JSON.stringify({
    sourceRoot: lock.sourceRoot,
    items: sortedItems,
    ...(Object.keys(examples).length ? { examples } : {}),
  }, null, 2)}\n`);
}
