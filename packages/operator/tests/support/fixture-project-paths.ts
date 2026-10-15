import type { AppUIModel } from "../../src/framework/contracts/app-ui-model";
import { resolveAgentUIProjectPaths } from "../../src/project/agent-ui-project-paths";
import { collectPluginProjectFacts as collectFacts, generatePluginRegistry as generateRegistry } from "../../src/project/registry-generator";
import { uiOperatorConfig } from "../../src/project/project-config";
import type { UIOperatorConfig } from "../../src/project/types";

export function fixtureProjectPaths(projectRoot: string, config: UIOperatorConfig = uiOperatorConfig) {
  return {
    ...resolveAgentUIProjectPaths(projectRoot, { mode: "platform", sourceRoot: "agent-ui" }, config),
    sourceRoot: projectRoot,
    agentUIAdaptersRoot: `${projectRoot}/agent-ui`,
    appUIModelPath: `${projectRoot}/app-ui/app-ui.json`,
    pluginsRoot: `${projectRoot}/plugins`,
    generatedPluginRegistryPath: `${projectRoot}/plugins/registry.generated.ts`,
    pluginRegistryEntryPath: `${projectRoot}/plugins/index.ts`,
    runtimeRoot: `${projectRoot}/runtime`,
  };
}

export function generatePluginRegistry(
  projectRoot: string,
  model: AppUIModel,
  config: UIOperatorConfig = uiOperatorConfig,
) {
  return generateRegistry(projectRoot, model, { config, paths: fixtureProjectPaths(projectRoot, config) });
}

export function collectPluginProjectFacts(projectRoot: string, config: UIOperatorConfig) {
  return collectFacts(projectRoot, config, fixtureProjectPaths(projectRoot, config));
}
