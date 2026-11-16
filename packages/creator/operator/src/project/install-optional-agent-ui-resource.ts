import { loadAgentUISourceRegistry, isAgentUISourceItemAvailable, isOptionalAgentUISourceItem, officialResourceRegistry } from "../source-catalog/index.js";
import { inspectAgentUISources } from "./source-registry/index";
import { applyAgentUISourceProjectMutation, recoverPendingAgentUISourceProjectMutation } from "./source-registry/project-mutation";
import { AgentUISourceError } from "./source-registry/path-policy";
import { resourcePaths } from "./optional-resource-paths";

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
  await applyAgentUISourceProjectMutation(projectRoot, { itemId: canonicalItemId, expectedStateHash: inspection.stateHash }, { config });
}
