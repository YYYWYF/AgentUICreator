import { writeGeneratedPluginRegistry } from "../generate-plugin-registry";
import { writeGeneratedFrontendToolRegistries } from "../generate-frontend-tool-registry";
import { inspectAgentUISources, applyAgentUISourceItem } from "./source-registry";
import { AgentUISourceError } from "./source-registry/path-policy";
import { resourcePaths } from "./optional-resource-paths";

/** Installs source/adapters independently of scenarios and AppUIModel composition. */
export async function installOptionalAgentUIResource(projectRoot: string, sourceItemId: string): Promise<void> {
  const { config } = await resourcePaths(projectRoot);
  const inspection = await inspectAgentUISources(projectRoot, config);
  const item = inspection.items.find(item => item.id === sourceItemId);
  if (!item || !/^(integration|demo)\//.test(sourceItemId)) throw new Error("Optional Agent UI resource is unavailable");
  const missing = item.resolvedRequirements.filter(requirement => !requirement.compatible).map(({ name, required }) => ({ name, required }));
  if (missing.length) throw new AgentUISourceError("AGENT_UI_PACKAGE_REQUIREMENTS_UNMET", `缺少依赖：${missing.map(item => `${item.name} ${item.required}`).join(", ")}`, missing);
  // Also repairs dependency closure and synchronizes clean older versions.
  if (item.status !== "customized") {
    await applyAgentUISourceItem(projectRoot, { itemId: sourceItemId, expectedStateHash: inspection.stateHash }, config);
  } else if (item.dependencyIssues.length) {
    throw new AgentUISourceError("AGENT_UI_SOURCE_DEPENDENCY_NOT_INSTALLED", "Customized resource has missing dependencies.", item.dependencyIssues);
  }
  await writeGeneratedPluginRegistry(projectRoot);
  await writeGeneratedFrontendToolRegistries(projectRoot);
  const after = await inspectAgentUISources(projectRoot, config);
  const resource = after.items.find(item => item.id === sourceItemId);
  const closureIds = new Set([sourceItemId, ...(resource?.dependencies ?? [])]);
  const invalid = after.items.filter(item => closureIds.has(item.id)).filter(item =>
    !["managed", "customized"].includes(item.status) || item.dependencyIssues.length || item.resolvedRequirements.some(requirement => !requirement.compatible));
  if (!resource || invalid.length) throw new AgentUISourceError("AGENT_UI_SOURCE_INTEGRITY_FAILED", "Installed resource dependency closure is incomplete.", invalid);
}
