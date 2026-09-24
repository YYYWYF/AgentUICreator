import path from "node:path";

import type { AgentUIProjectConfig } from "../../framework/contracts/agent-ui-project";
import type { UIProjectControlConfig } from "./types";
import { uiProjectControlConfig } from "./project-config";
import { validateAgentUISourceRoot } from "@agent-ui/bootstrap";

export interface AgentUIProjectPaths {
  readonly projectRoot: string;
  readonly metadataRoot: string;
  readonly projectConfigPath: string;
  readonly sourceRoot: string;
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

export { AgentUISourceRootError, validateAgentUISourceRoot } from "@agent-ui/bootstrap";

export function projectControlConfigForPaths(
  paths: AgentUIProjectPaths,
  config: UIProjectControlConfig = uiProjectControlConfig,
): UIProjectControlConfig {
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
  config: UIProjectControlConfig = uiProjectControlConfig,
): AgentUIProjectPaths {
  const root = path.resolve(projectRoot);
  const metadataRoot = path.resolve(root, config.agentUI.metadataRoot);
  const sourceRoot = projectConfig.version === "2"
    ? validateAgentUISourceRoot(root, projectConfig.sourceRoot)
    : validateAgentUISourceRoot(root, config.agentUI.sourceRoot);
  const managedRoot = projectConfig.version === "2" ? sourceRoot : root;
  const pluginsRoot = path.join(managedRoot, "plugins");
  return {
    projectRoot: root,
    metadataRoot,
    projectConfigPath: path.join(metadataRoot, "project.json"),
    sourceRoot,
    appUIModelPath: path.join(managedRoot, "app-ui", "app-ui.json"),
    sourceLockPath: path.join(metadataRoot, "source-lock.json"),
    pluginsRoot,
    generatedPluginRegistryPath: path.join(pluginsRoot, "registry.generated.ts"),
    generatedRuntimeConfigPath: path.join(managedRoot, "application", "runtime-config.generated.ts"),
    pluginRegistryEntryPath: path.join(pluginsRoot, "index.ts"),
    runtimeRoot: path.join(managedRoot, "runtime"),
  };
}
