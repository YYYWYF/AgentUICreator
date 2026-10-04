import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import {
  parseAgentUIProjectConfigJson,
  type AgentUIProjectConfig,
} from "../framework/contracts/agent-ui-project";
import { parseAppUIModelJson } from "../framework/contracts/app-ui-model";
import { resolveAgentUIProjectPaths, projectControlConfigForPaths, projectRelativePath, type AgentUIProjectPaths } from "./agent-ui-project-paths";
import { generatePluginRegistry, PLUGIN_REGISTRY_ENTRY_SOURCE } from "./registry-generator";
import { verifyPluginChildSlots } from "./plugin-child-slot-verifier";
import { uiProjectControlConfig } from "./project-config";
import type { UIProjectControlConfig } from "./types";

export interface CreatorProjectIssue {
  readonly code: string;
  readonly message: string;
  readonly severity?: "error" | "warning";
}

export type CreatorProjectState =
  | { readonly status: "uninitialized" }
  | { readonly status: "ready"; readonly projectConfig: AgentUIProjectConfig; readonly paths: AgentUIProjectPaths; readonly warnings?: CreatorProjectIssue[] }
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
  return { status: "broken", issues: [{ code, message: error instanceof Error ? error.message : String(error), severity: "error" }] };
}

export async function inspectCreatorProjectStructure(
  projectRoot: string,
  config: UIProjectControlConfig = uiProjectControlConfig,
): Promise<CreatorProjectState> {
  const root = path.resolve(projectRoot);
  const configPath = path.join(root, config.agentUI.metadataRoot, "project.json");
  const configSource = await optionalFile(configPath);
  if (configSource === undefined) {
    const initJournal = await optionalFile(path.join(root, config.agentUI.metadataRoot, "init-transaction.json"));
    if (initJournal !== undefined) {
      return broken("AGENT_UI_INITIALIZATION_INTERRUPTED", "Agent UI initialization was interrupted before project.json was committed.");
    }
    return { status: "uninitialized" };
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
  return { status: "ready", projectConfig, paths };
}

async function inspectCreatorProjectCore(
  projectRoot: string,
  config: UIProjectControlConfig = uiProjectControlConfig,
): Promise<CreatorProjectState> {
  const structure = await inspectCreatorProjectStructure(projectRoot, config);
  if (structure.status !== "ready") return structure;

  const { paths } = structure;
  try {
    const model = parseAppUIModelJson(await readFile(paths.appUIModelPath, "utf8"));
    const generation = await generatePluginRegistry(projectRoot, model, {
      config: projectControlConfigForPaths(paths, config), paths,
    });
    const selected = new Set(generation.activeComposition.selectedPluginIds);
    const childSlotIssues = await verifyPluginChildSlots(
      projectRoot,
      generation.assets.filter((asset) => selected.has(asset.pluginId)),
    );
    const errors = [
      ...generation.errors,
      ...generation.serviceDependencies.issues,
      ...childSlotIssues,
    ];
    if (errors.length > 0) {
      return { status: "broken", issues: errors.map((issue) => ({
        code: issue.code, message: issue.message, severity: "error" as const,
      })) };
    }
    const warnings: CreatorProjectIssue[] = [];
    const generatedSource = await optionalFile(paths.generatedPluginRegistryPath);
    if (generatedSource !== generation.capabilityCatalog.source) {
      warnings.push({
        code: "AGENT_UI_GENERATED_REGISTRY_STALE",
        message: `${projectRelativePath(projectRoot, paths.generatedPluginRegistryPath)} is missing or stale.`,
        severity: "warning",
      });
    }
    const entrySource = await optionalFile(paths.pluginRegistryEntryPath);
    if (entrySource !== PLUGIN_REGISTRY_ENTRY_SOURCE) {
      warnings.push({
        code: "AGENT_UI_REGISTRY_ENTRY_STALE",
        message: `${projectRelativePath(projectRoot, paths.pluginRegistryEntryPath)} is missing or stale.`,
        severity: "warning",
      });
    }
    return { ...structure, ...(warnings.length === 0 ? {} : { warnings }) };
  } catch (error) {
    return broken("AGENT_UI_STATIC_INSPECTION_FAILED", error);
  }
}

export async function inspectCreatorProject(
  projectRoot: string,
  config: UIProjectControlConfig = uiProjectControlConfig,
): Promise<CreatorProjectState> {
  const state = await inspectCreatorProjectCore(projectRoot, config);
  const metadataRoot = path.join(path.resolve(projectRoot), config.agentUI.metadataRoot);
  if (await optionalFile(path.join(metadataRoot, "project.json")) === undefined ||
      await optionalFile(path.join(metadataRoot, "init-transaction.json")) === undefined) {
    return state;
  }
  if (state.status === "broken") {
    return { ...state, issues: [...state.issues, {
      code: "AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED",
      message: "Committed Agent UI initialization needs recovery after static inspection failed.",
      severity: "error",
    }] };
  }
  if (state.status === "ready") {
    return { ...state, warnings: [...(state.warnings ?? []), {
      code: "AGENT_UI_INITIALIZATION_RECOVERY_REQUIRED",
      message: "Committed Agent UI initialization left a journal that needs recovery.",
      severity: "warning",
    }] };
  }
  return state;
}
