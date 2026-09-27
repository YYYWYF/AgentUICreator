import { loadAgentUISourceRegistry, isOptionalAgentUISourceItem } from "@agent-ui/source-registry";
import { inspectAgentUISources } from "./source-registry/index";
import { applyAgentUISourceProjectMutation, recoverPendingAgentUISourceProjectMutation } from "./source-registry/project-mutation";
import { AgentUISourceError } from "./source-registry/path-policy";
import { resourcePaths } from "./optional-resource-paths";

/** Installs source/adapters independently of scenarios and AppUIModel composition. */
export async function installOptionalAgentUIResource(projectRoot: string, sourceItemId: string): Promise<void> {
  const { config } = await resourcePaths(projectRoot);
  await recoverPendingAgentUISourceProjectMutation(projectRoot, config);
  const inspection = await inspectAgentUISources(projectRoot, config);
  const item = inspection.items.find(item => item.id === sourceItemId);
  const definition = (await loadAgentUISourceRegistry()).byId.get(sourceItemId);
  if (!item || !definition || !isOptionalAgentUISourceItem(definition)) throw new Error("Optional Agent UI resource is unavailable");
  const missing = item.resolvedRequirements.filter(requirement => !requirement.compatible).map(({ name, required }) => ({ name, required }));
  if (missing.length) throw new AgentUISourceError("AGENT_UI_PACKAGE_REQUIREMENTS_UNMET", `缺少依赖：${missing.map(item => `${item.name} ${item.required}`).join(", ")}`, missing);
  await applyAgentUISourceProjectMutation(projectRoot, { itemId: sourceItemId, expectedStateHash: inspection.stateHash }, { config });
  const after = await inspectAgentUISources(projectRoot, config);
  const resource = after.items.find(item => item.id === sourceItemId);
  const closureIds = new Set([sourceItemId, ...(resource?.dependencies ?? [])]);
  const invalid = after.items.filter(item => closureIds.has(item.id)).filter(item =>
    !["managed", "customized"].includes(item.status) || item.dependencyIssues.length || item.resolvedRequirements.some(requirement => !requirement.compatible));
  if (!resource || invalid.length) throw new AgentUISourceError("AGENT_UI_SOURCE_INTEGRITY_FAILED", "Installed resource dependency closure is incomplete.", invalid);
}
