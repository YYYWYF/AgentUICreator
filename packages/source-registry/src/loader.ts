import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AgentUISourceRegistryError,
  MAX_AGENT_UI_SOURCE_FILE_BYTES,
  MAX_AGENT_UI_SOURCE_ITEM_BYTES,
  assertSafeRegistryRelativePath,
  parseRegistryManifest,
  parseSourceItem,
} from "./schema.js";
import type {
  LoadedAgentUISourceItem,
  LoadedAgentUISourceRegistry,
} from "./types.js";

export const DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "registry",
);

async function readJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    throw new AgentUISourceRegistryError(
      "AGENT_UI_SOURCE_REGISTRY_INVALID",
      `Unable to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function assertNoCycles(items: LoadedAgentUISourceItem[]): void {
  const byId = new Map(items.map((item) => [item.id, item]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, chain: string[]): void => {
    if (visiting.has(id)) {
      throw new AgentUISourceRegistryError(
        "AGENT_UI_SOURCE_REQUIREMENT_CYCLE",
        `Source item requirement cycle: ${[...chain, id].join(" -> ")}.`,
      );
    }
    if (visited.has(id)) return;
    const item = byId.get(id);
    if (item === undefined) return;
    visiting.add(id);
    for (const required of item.requires ?? []) {
      if (!byId.has(required)) {
        throw new AgentUISourceRegistryError(
          "AGENT_UI_SOURCE_REQUIREMENT_NOT_FOUND",
          `Source item "${id}" requires unknown item "${required}".`,
        );
      }
      visit(required, [...chain, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const item of items) visit(item.id, []);
}

export async function loadAgentUISourceRegistry(
  registryRoot = DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT,
): Promise<LoadedAgentUISourceRegistry> {
  const root = path.resolve(registryRoot);
  const manifest = parseRegistryManifest(await readJson(path.join(root, "registry.json")));
  const ids = new Set<string>();
  const targets = new Map<string, string>();
  const items: LoadedAgentUISourceItem[] = [];

  for (const reference of manifest.items) {
    if (ids.has(reference.id)) {
      throw new AgentUISourceRegistryError(
        "AGENT_UI_SOURCE_DUPLICATE_ITEM",
        `Duplicate source item id "${reference.id}".`,
      );
    }
    ids.add(reference.id);
    assertSafeRegistryRelativePath(reference.path, "source item manifest path");
    const manifestPath = path.resolve(root, reference.path);
    if (path.relative(root, manifestPath).startsWith("..")) {
      throw new AgentUISourceRegistryError(
        "AGENT_UI_SOURCE_INVALID_PATH",
        `Source item manifest escapes the registry root: ${reference.path}.`,
      );
    }
    const item = parseSourceItem(await readJson(manifestPath), reference.path);
    if (item.id !== reference.id) {
      throw new AgentUISourceRegistryError(
        "AGENT_UI_SOURCE_ITEM_INVALID",
        `Registry id "${reference.id}" does not match item id "${item.id}".`,
      );
    }
    const itemRoot = path.dirname(manifestPath);
    let totalBytes = 0;
    const itemTargets = new Set<string>();
    const loadedFiles = await Promise.all(item.files.map(async (file) => {
      if (itemTargets.has(file.target)) {
        throw new AgentUISourceRegistryError(
          "AGENT_UI_SOURCE_TARGET_CONFLICT",
          `Source item "${item.id}" declares target "${file.target}" more than once.`,
        );
      }
      itemTargets.add(file.target);
      const owner = targets.get(file.target);
      if (owner !== undefined) {
        throw new AgentUISourceRegistryError(
          "AGENT_UI_SOURCE_TARGET_CONFLICT",
          `Source items "${owner}" and "${item.id}" both own "${file.target}".`,
        );
      }
      targets.set(file.target, item.id);
      const absolutePath = path.resolve(itemRoot, file.source);
      if (path.relative(itemRoot, absolutePath).startsWith("..")) {
        throw new AgentUISourceRegistryError(
          "AGENT_UI_SOURCE_INVALID_PATH",
          `Source file escapes item root: ${file.source}.`,
        );
      }
      let fileStat;
      try {
        fileStat = await stat(absolutePath);
      } catch {
        throw new AgentUISourceRegistryError(
          "AGENT_UI_SOURCE_FILE_NOT_FOUND",
          `Source item "${item.id}" references missing file "${file.source}".`,
        );
      }
      if (!fileStat.isFile()) {
        throw new AgentUISourceRegistryError(
          "AGENT_UI_SOURCE_FILE_NOT_FOUND",
          `Source item "${item.id}" source "${file.source}" is not a file.`,
        );
      }
      if (fileStat.size > MAX_AGENT_UI_SOURCE_FILE_BYTES) {
        throw new AgentUISourceRegistryError(
          "AGENT_UI_SOURCE_ITEM_LIMIT_EXCEEDED",
          `Source file "${file.source}" exceeds ${MAX_AGENT_UI_SOURCE_FILE_BYTES} bytes.`,
        );
      }
      totalBytes += fileStat.size;
      const content = await readFile(absolutePath);
      return { ...file, absolutePath, content };
    }));
    if (totalBytes > MAX_AGENT_UI_SOURCE_ITEM_BYTES) {
      throw new AgentUISourceRegistryError(
        "AGENT_UI_SOURCE_ITEM_LIMIT_EXCEEDED",
        `Source item "${item.id}" exceeds ${MAX_AGENT_UI_SOURCE_ITEM_BYTES} bytes.`,
      );
    }
    items.push({ ...item, itemRoot, manifestPath, loadedFiles });
  }

  assertNoCycles(items);
  items.sort((left, right) => left.id.localeCompare(right.id));
  return { root, items, byId: new Map(items.map((item) => [item.id, item])) };
}
