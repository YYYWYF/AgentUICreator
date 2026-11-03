import { existsSync } from "node:fs";
import path from "node:path";

import type { AgentUIProjectConfig } from "../framework/contracts/agent-ui-project";
import type { UIOperatorConfig } from "./types";
import { uiOperatorConfig } from "./project-config";
import { validateAgentUISourceRoot } from "../bootstrap/index.js";

export interface AgentUIProjectPaths {
  readonly projectRoot: string;
  readonly metadataRoot: string;
  readonly projectConfigPath: string;
  readonly sourceRoot: string;
  readonly agentUIAdaptersRoot: string;
  readonly appUIModelPath: string;
  readonly sourceLockPath: string;
  readonly pluginsRoot: string;
  readonly generatedPluginRegistryPath: string;
  readonly generatedRuntimeConfigPath: string;
  readonly pluginRegistryEntryPath: string;
  readonly runtimeRoot: string;
}

export function projectRelativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join("/");
}

export { AgentUISourceRootError, validateAgentUISourceRoot } from "../bootstrap/index.js";

export function operatorConfigForPaths(
  paths: AgentUIProjectPaths,
  config: UIOperatorConfig = uiOperatorConfig,
): UIOperatorConfig {
  return {
    ...config,
    agentUI: {
      ...config.agentUI,
      sourceRoot: path.relative(paths.projectRoot, paths.sourceRoot).split(path.sep).join("/"),
    },
  };
}

export function resolveAgentUIProjectPaths(
  projectRoot: string,
  projectConfig: AgentUIProjectConfig,
  config: UIOperatorConfig = uiOperatorConfig,
): AgentUIProjectPaths {
  const root = path.resolve(projectRoot);
  const metadataRoot = path.resolve(root, config.agentUI.metadataRoot);
  const sourceRoot = validateAgentUISourceRoot(root, projectConfig.sourceRoot);
  const managedRoot = sourceRoot;
  const pluginsRoot = path.join(managedRoot, "plugins");
  const layout = resolveAgentUISourceLayout(managedRoot);
  return {
    projectRoot: root,
    metadataRoot,
    projectConfigPath: path.join(metadataRoot, "project.json"),
    sourceRoot,
    agentUIAdaptersRoot: layout.presentationRoot,
    appUIModelPath: layout.appUIModelPath,
    sourceLockPath: path.join(metadataRoot, "source-lock.json"),
    pluginsRoot,
    generatedPluginRegistryPath: path.join(pluginsRoot, "registry.generated.ts"),
    generatedRuntimeConfigPath: path.join(managedRoot, "application", "runtime-config.generated.ts"),
    pluginRegistryEntryPath: path.join(pluginsRoot, "index.ts"),
    runtimeRoot: path.join(managedRoot, "runtime"),
  };
}

/** Filesystem probes select existing layouts; new projects always use the flat layout.
 * Path operations stay native, including drive, Unicode and UNC source roots. */
export function resolveAgentUISourceLayout(sourceRoot: string, exists: (file: string) => boolean = existsSync, paths: Pick<typeof path, "join"> = path) {
  const model = paths.join(sourceRoot, "app-ui.json");
  const legacyModel = paths.join(sourceRoot, "app-ui", "app-ui.json");
  const legacyPresentation = paths.join(sourceRoot, "agent-ui");
  const flatModel = exists(model);
  return {
    appUIModelPath: flatModel || !exists(legacyModel) ? model : legacyModel,
    presentationRoot: exists(paths.join(sourceRoot, "config.ts")) || flatModel
      ? sourceRoot
      : exists(paths.join(legacyPresentation, "config.ts")) || exists(paths.join(legacyPresentation, "i18n", "locale-config.ts"))
        ? legacyPresentation : sourceRoot,
  };
}
