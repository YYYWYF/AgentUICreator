import { lstat, mkdir } from "node:fs/promises";
import path from "node:path";

import type { UIProjectControlConfig } from "../types";

export class AgentUISourceError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AgentUISourceError";
    this.code = code;
    this.details = details;
  }
}

export function assertSafeProjectRelativePath(
  value: string,
  label: string,
): void {
  if (
    value.length === 0 ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.startsWith("~") ||
    /^[A-Za-z]:/.test(value) ||
    path.posix.normalize(value) !== value ||
    value === "." ||
    value.startsWith("../") ||
    value.includes("/../")
  ) {
    throw new AgentUISourceError(
      "AGENT_UI_SOURCE_INVALID_PATH",
      `${label} must be a normalized relative POSIX path.`,
      { path: value },
    );
  }
}

export function resolveProjectPath(
  projectRoot: string,
  relativePath: string,
  label: string,
): string {
  assertSafeProjectRelativePath(relativePath, label);
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new AgentUISourceError(
      "AGENT_UI_SOURCE_INVALID_PATH",
      `${label} escapes the project root.`,
      { path: relativePath },
    );
  }
  return resolved;
}

async function lstatOptional(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function assertNoSymbolicLinkTraversal(
  root: string,
  relativePath: string,
): Promise<void> {
  assertSafeProjectRelativePath(relativePath, "Agent UI source target");
  let current = path.resolve(root);
  const rootStat = await lstatOptional(current);
  if (rootStat?.isSymbolicLink()) {
    throw new AgentUISourceError(
      "AGENT_UI_SOURCE_PATH_CONFLICT",
      "Agent UI Source Root cannot be a symbolic link.",
      { path: root },
    );
  }
  for (const part of relativePath.split("/")) {
    current = path.join(current, part);
    const currentStat = await lstatOptional(current);
    if (currentStat?.isSymbolicLink()) {
      throw new AgentUISourceError(
        "AGENT_UI_SOURCE_PATH_CONFLICT",
        "Agent UI source paths cannot traverse symbolic links.",
        { path: relativePath },
      );
    }
  }
}

export async function resolveAgentUISourceRoots(
  projectRoot: string,
  config: UIProjectControlConfig,
  options: { createMetadata?: boolean } = {},
) {
  await assertNoSymbolicLinkTraversal(
    path.resolve(projectRoot),
    config.agentUI.sourceRoot,
  );
  await assertNoSymbolicLinkTraversal(
    path.resolve(projectRoot),
    config.agentUI.metadataRoot,
  );
  const sourceRoot = resolveProjectPath(
    projectRoot,
    config.agentUI.sourceRoot,
    "Agent UI Source Root",
  );
  const metadataRoot = resolveProjectPath(
    projectRoot,
    config.agentUI.metadataRoot,
    "Agent UI metadata root",
  );
  for (const [label, root] of [
    ["Agent UI Source Root", sourceRoot],
    ["Agent UI metadata root", metadataRoot],
  ] as const) {
    const rootStat = await lstatOptional(root);
    if (rootStat?.isSymbolicLink()) {
      throw new AgentUISourceError(
        "AGENT_UI_SOURCE_PATH_CONFLICT",
        `${label} cannot be a symbolic link.`,
        { path: path.relative(projectRoot, root) },
      );
    }
    if (rootStat !== undefined && !rootStat.isDirectory()) {
      throw new AgentUISourceError(
        "AGENT_UI_SOURCE_PATH_CONFLICT",
        `${label} must be a directory.`,
        { path: path.relative(projectRoot, root) },
      );
    }
  }
  if (options.createMetadata) {
    await mkdir(metadataRoot, { recursive: true });
  }
  return { sourceRoot, metadataRoot };
}
