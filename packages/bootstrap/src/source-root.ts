import { lstat, realpath, readdir, readFile } from "node:fs/promises";
import path from "node:path";

export class AgentUISourceRootError extends Error {
  readonly code = "AGENT_UI_SOURCE_ROOT_INVALID";
}

/** Shared syntax and lexical containment contract for V2 source roots. */
export function validateAgentUISourceRoot(projectRoot: string, sourceRoot: string): string {
  const segments = sourceRoot.replaceAll("\\", "/").split("/");
  if (
    sourceRoot.trim() !== sourceRoot || sourceRoot === "" ||
    path.isAbsolute(sourceRoot) || path.win32.isAbsolute(sourceRoot) ||
    /^[A-Za-z]:/.test(sourceRoot) || sourceRoot.includes(":") ||
    sourceRoot.includes("\0") || segments.includes("..") ||
    segments.includes("") || segments.includes(".") || sourceRoot.includes("\\")
  ) throw new AgentUISourceRootError(`Invalid Agent UI sourceRoot: ${sourceRoot}`);
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, sourceRoot);
  const relative = path.relative(root, resolved);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new AgentUISourceRootError(`Agent UI sourceRoot must be inside Project Root: ${sourceRoot}`);
  }
  return resolved;
}

export async function suggestAgentUISourceRoot(projectRoot: string): Promise<string> {
  try {
    if ((await lstat(path.join(projectRoot, "src"))).isDirectory()) return "src/agent-ui";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return "agent-ui";
}

export type AgentUISourceTargetState = "missing" | "empty" | "managed" | "occupied";
export interface CreatorProjectSetupIssue { readonly code: string; readonly message: string }
export interface CreatorProjectSetupValidation {
  readonly valid: boolean;
  readonly sourceRoot: {
    readonly normalized: string;
    readonly parentExists: boolean;
    readonly targetState: AgentUISourceTargetState;
  };
  readonly issues: readonly CreatorProjectSetupIssue[];
}

async function statOptional(filePath: string) {
  try { return await lstat(filePath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function hasSymbolicLinkTraversal(projectRoot: string, relativePath: string): Promise<boolean> {
  let current = path.resolve(projectRoot);
  for (const segment of relativePath.split("/")) {
    current = path.join(current, segment);
    const stat = await statOptional(current);
    if (stat?.isSymbolicLink()) return true;
    if (stat === undefined) return false;
  }
  return false;
}

export async function validateAgentUIProjectSetup(input: {
  projectRoot: string; mode: unknown; sourceRoot: string;
}): Promise<CreatorProjectSetupValidation> {
  const issues: CreatorProjectSetupIssue[] = [];
  if (!AGENT_UI_MODES_SET.has(input.mode)) {
    issues.push({ code: "AGENT_UI_MODE_INVALID", message: "Select a supported Agent UI Mode." });
  }
  let target: string;
  try { target = validateAgentUISourceRoot(input.projectRoot, input.sourceRoot); }
  catch (error) {
    return {
      valid: false,
      sourceRoot: { normalized: input.sourceRoot, parentExists: false, targetState: "missing" },
      issues: [...issues, { code: "AGENT_UI_SOURCE_ROOT_INVALID", message: error instanceof Error ? error.message : String(error) }],
    };
  }
  const normalized = path.relative(path.resolve(input.projectRoot), target).split(path.sep).join("/");
  if (normalized === ".agent-ui" || normalized.startsWith(".agent-ui/")) {
    issues.push({ code: "AGENT_UI_SOURCE_ROOT_INVALID", message: "Source Root cannot overlap Agent UI metadata." });
  }
  if (await hasSymbolicLinkTraversal(input.projectRoot, normalized)) {
    issues.push({ code: "AGENT_UI_SOURCE_ROOT_INVALID", message: "Source Root cannot traverse symbolic links." });
  }
  const configPath = path.join(input.projectRoot, ".agent-ui", "project.json");
  const existingConfig = await statOptional(configPath);
  if (existingConfig !== undefined) {
    issues.push({ code: "AGENT_UI_PROJECT_ALREADY_INITIALIZED", message: "Agent UI project configuration already exists." });
  }
  const rootReal = await realpath(input.projectRoot);
  const parent = path.dirname(target);
  const parentStat = await statOptional(parent);
  let parentExists = parentStat?.isDirectory() ?? false;
  if (parentExists) {
    const parentReal = await realpath(parent);
    const relative = path.relative(rootReal, parentReal);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      parentExists = false;
      issues.push({ code: "AGENT_UI_SOURCE_ROOT_INVALID", message: "Source Root parent escapes Project Root." });
    }
  }
  if (!parentExists && !issues.some((issue) => issue.code === "AGENT_UI_SOURCE_ROOT_INVALID")) {
    issues.push({ code: "AGENT_UI_SOURCE_PARENT_NOT_FOUND", message: "Source Root parent must already exist." });
  }
  let targetState: AgentUISourceTargetState = "missing";
  const targetStat = await statOptional(target);
  if (targetStat !== undefined) {
    if (targetStat.isSymbolicLink() || !targetStat.isDirectory()) {
      targetState = "occupied";
      issues.push({ code: "AGENT_UI_SOURCE_ROOT_INVALID", message: "Source Root must be a real directory." });
    } else {
      const entries = await readdir(target);
      targetState = entries.length === 0 ? "empty" : "occupied";
      if (targetState === "occupied") {
        let managed = false;
        if (existingConfig !== undefined) {
          try {
            const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
            managed = config.version === "2" && config.sourceRoot === normalized;
          } catch { /* Invalid config remains a project state issue. */ }
        }
        if (managed) targetState = "managed";
        else issues.push({ code: "AGENT_UI_SOURCE_ROOT_NOT_EMPTY", message: "Source Root contains existing files." });
      }
    }
  }
  return { valid: issues.length === 0, sourceRoot: { normalized, parentExists, targetState }, issues };
}

const AGENT_UI_MODES_SET = new Set<unknown>(["assistant", "embedded", "platform"]);
