import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import {
  LEGACY_AGENT_UI_MODE,
  parseAgentUIProjectConfigJson,
  type AgentUIProjectConfig,
  type AgentUIProjectConfigV1,
} from "../../framework/contracts/agent-ui-project";
import { parseAppUIModelJson } from "../../framework/contracts/app-ui-model";
import { resolveAgentUIProjectPaths, type AgentUIProjectPaths } from "./agent-ui-project-paths";
import { uiProjectControlConfig } from "./project-config";
import type { UIProjectControlConfig } from "./types";

export interface CreatorProjectIssue {
  readonly code: string;
  readonly message: string;
}

export type CreatorProjectState =
  | { readonly status: "uninitialized" }
  | { readonly status: "ready"; readonly projectConfig: AgentUIProjectConfig; readonly paths: AgentUIProjectPaths }
  | { readonly status: "legacy"; readonly projectConfig: AgentUIProjectConfigV1; readonly paths: AgentUIProjectPaths }
  | { readonly status: "broken"; readonly issues: CreatorProjectIssue[] };

async function optionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function broken(code: string, error: unknown): CreatorProjectState {
  return { status: "broken", issues: [{ code, message: error instanceof Error ? error.message : String(error) }] };
}

export async function inspectCreatorProject(
  projectRoot: string,
  config: UIProjectControlConfig = uiProjectControlConfig,
): Promise<CreatorProjectState> {
  const root = path.resolve(projectRoot);
  const configPath = path.join(root, config.agentUI.metadataRoot, "project.json");
  const configSource = await optionalFile(configPath);
  const legacyConfig: AgentUIProjectConfigV1 = { version: "1", mode: LEGACY_AGENT_UI_MODE };
  if (configSource === undefined) {
    const paths = resolveAgentUIProjectPaths(root, legacyConfig, config);
    const modelSource = await optionalFile(paths.appUIModelPath);
    if (modelSource === undefined) return { status: "uninitialized" };
    try {
      parseAppUIModelJson(modelSource);
      return { status: "legacy", projectConfig: legacyConfig, paths };
    } catch (error) {
      return broken("AGENT_UI_APP_UI_MODEL_INVALID", error);
    }
  }

  let projectConfig: AgentUIProjectConfig;
  try {
    projectConfig = parseAgentUIProjectConfigJson(configSource);
  } catch (error) {
    return broken("AGENT_UI_PROJECT_CONFIG_INVALID", error);
  }
  let paths: AgentUIProjectPaths;
  try {
    paths = resolveAgentUIProjectPaths(root, projectConfig, config);
    if (projectConfig.version === "2") {
      const realProjectRoot = await realpath(root);
      const existingParent = await realpath(path.dirname(paths.sourceRoot));
      const relative = path.relative(realProjectRoot, existingParent);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error("Agent UI sourceRoot parent resolves outside Project Root.");
      }
      try {
        const actualSourceRoot = await realpath(paths.sourceRoot);
        const sourceRelative = path.relative(realProjectRoot, actualSourceRoot);
        if (sourceRelative === "" || sourceRelative === ".." || sourceRelative.startsWith(`..${path.sep}`) || path.isAbsolute(sourceRelative)) {
          throw new Error("Agent UI sourceRoot resolves outside Project Root.");
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  } catch (error) {
    return broken("AGENT_UI_SOURCE_ROOT_INVALID", error);
  }
  const modelSource = await optionalFile(paths.appUIModelPath);
  if (modelSource === undefined) {
    return broken("AGENT_UI_APP_UI_MODEL_MISSING", `Missing ${paths.appUIModelPath}`);
  }
  try {
    parseAppUIModelJson(modelSource);
  } catch (error) {
    return broken("AGENT_UI_APP_UI_MODEL_INVALID", error);
  }
  if (projectConfig.version === "2") {
    const lockSource = await optionalFile(paths.sourceLockPath);
    if (lockSource !== undefined) {
      try {
        const lock = JSON.parse(lockSource) as unknown;
        if (typeof lock !== "object" || lock === null || Array.isArray(lock) ||
            (lock as Record<string, unknown>).sourceRoot !== projectConfig.sourceRoot) {
          return broken("AGENT_UI_SOURCE_LOCK_CONFLICT", "source-lock.json sourceRoot conflicts with project.json.");
        }
      } catch (error) {
        return broken("AGENT_UI_SOURCE_LOCK_INVALID", error);
      }
    }
  }
  return { status: "ready", projectConfig, paths };
}
