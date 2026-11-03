import { loadAgentUISourceRegistry, isAgentUISourceItemAvailable, isOptionalAgentUISourceItem, officialResourceRegistry } from "../source-catalog/index.js";
import { inspectAgentUISources } from "./source-registry/index";
import { applyAgentUISourceProjectMutation, recoverPendingAgentUISourceProjectMutation } from "./source-registry/project-mutation";
import { AgentUISourceError } from "./source-registry/path-policy";
import { resourcePaths } from "./optional-resource-paths";
import { packageSourceDependency } from "./source-registry/package-dependencies";

/** Installs source/adapters independently of scenarios and AppUIModel composition. */
export async function installOptionalAgentUIResource(projectRoot: string, sourceItemId: string): Promise<void> {
  if (!isAgentUISourceItemAvailable(sourceItemId)) throw new AgentUISourceError("AGENT_UI_RESOURCE_DISABLED", "This resource is not available in this release.", { itemId: sourceItemId });
  const { config } = await resourcePaths(projectRoot);
  await recoverPendingAgentUISourceProjectMutation(projectRoot, config);
  const inspection = await inspectAgentUISources(projectRoot, config);
  const registry = await loadAgentUISourceRegistry();
  const definition = registry.byId.get(sourceItemId);
  const canonicalItemId = definition?.id ?? sourceItemId;
  const item = inspection.items.find(item => item.id === canonicalItemId);
  if (!item || !definition || !(isOptionalAgentUISourceItem(definition) || officialResourceRegistry.resources.some(resource => "sourceItemId" in resource.implementation && resource.implementation.sourceItemId === canonicalItemId))) throw new Error("Optional Agent UI resource is unavailable");
  const missing = item.resolvedRequirements.filter(requirement => !requirement.compatible).map(({ name, required }) => ({ name, required }));
  if (missing.length) throw new AgentUISourceError("AGENT_UI_PACKAGE_REQUIREMENTS_UNMET", `缺少依赖：${missing.map(item => `${item.name} ${item.required}`).join(", ")}`, missing);
  await applyAgentUISourceProjectMutation(projectRoot, { itemId: canonicalItemId, expectedStateHash: inspection.stateHash }, { config });
  const after = await inspectAgentUISources(projectRoot, config);
  const resource = after.items.find(item => item.id === canonicalItemId);
  const closureIds = new Set([canonicalItemId, ...(resource?.dependencies ?? [])]);
  const invalid = after.items.filter(item => closureIds.has(item.id)).filter(item =>
    (!packageSourceDependency(item.id) && !["managed", "customized"].includes(item.status)) || item.dependencyIssues.length || item.resolvedRequirements.some(requirement => !requirement.compatible));
  if (!resource || invalid.length) throw new AgentUISourceError("AGENT_UI_SOURCE_INTEGRITY_FAILED", "Installed resource dependency closure is incomplete.", invalid);
}
