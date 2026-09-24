import type { AppUIModel } from "../framework/contracts/app-ui-model";
import { resolveAgentUIProjectPaths } from "../scripts/ui-project/agent-ui-project-paths";
import { collectPluginProjectFacts as collectFacts, generatePluginRegistry as generateRegistry } from "../scripts/ui-project/registry-generator";
import { uiProjectControlConfig } from "../scripts/ui-project/project-config";
import type { UIProjectControlConfig } from "../scripts/ui-project/types";

export function legacyProjectPaths(projectRoot: string, config: UIProjectControlConfig = uiProjectControlConfig) {
  return resolveAgentUIProjectPaths(projectRoot, { version: "1", mode: "platform" }, config);
}

export function generatePluginRegistry(
  projectRoot: string,
  model: AppUIModel,
  config: UIProjectControlConfig = uiProjectControlConfig,
) {
  return generateRegistry(projectRoot, model, { config, paths: legacyProjectPaths(projectRoot, config) });
}

export function collectPluginProjectFacts(projectRoot: string, config: UIProjectControlConfig) {
  return collectFacts(projectRoot, config, legacyProjectPaths(projectRoot, config));
}
