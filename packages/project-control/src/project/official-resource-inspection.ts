import { officialResourceRegistry, type OfficialAgentUIResource } from "@agent-ui/source-registry";
import { resourcePackageConflicts } from "./ensure-resource-packages";
import type { ResourceCompositionInspection, ResourceSourceInspection, ResourceImplementationInspection } from "../resources.mjs";
export type { ResourceCompositionInspection, ResourceSourceInspection } from "../resources.mjs";

/** Only the caller's explicit diagnostics endpoint may serialize this internal result. */
export function inspectOfficialResourceImplementation(resource: OfficialAgentUIResource, composition: ResourceCompositionInspection, sources: ResourceSourceInspection): ResourceImplementationInspection {
  const implementation = resource.implementation;
  const itemId = "sourceItemId" in implementation ? implementation.sourceItemId : `plugin/${implementation.pluginId}`;
  const item = sources.items.find(item => item.id === itemId);
  const closure = [item, ...(item?.dependencies ?? []).map(id => sources.items.find(item => item.id === id))];
  const packages = closure.flatMap(item => item?.resolvedRequirements ?? []);
  const conflicts = resourcePackageConflicts(packages);
  const blocked = closure.some(item => item?.status === "partial" || item?.status === "blocked" || item?.issues?.some(issue => issue.code === "AGENT_UI_PACKAGE_INCOMPATIBLE"));
  const duplicateProvider = implementation.type !== "source" && composition.pluginInstances.filter(instance => instance.pluginId === implementation.pluginId).length > 1;
  let status: "ready" | "missing" | "disabled" | "conflict";
  if (conflicts.length || blocked || duplicateProvider) status = "conflict";
  else {
    const sourceReady = (implementation.type !== "source" || sources.integrationRegistryReady !== false) &&
      closure.every(item => item && ["managed", "customized"].includes(item.status) && !item.dependencyIssues?.length &&
        !(item.resolvedRequirements ?? []).some(requirement => !requirement.compatible));
    const pluginId = "pluginId" in implementation ? implementation.pluginId : undefined;
    const source = composition.pluginSources.find(source => source.pluginId === pluginId);
    const pluginReady = !pluginId || (source?.status === "available" &&
      (!("dataMessageUIName" in implementation) || implementation.dataMessageUIName === undefined || source.dataMessageUINames.includes(implementation.dataMessageUIName)));
    const parents = new Map(composition.pluginInstances.map(instance => [instance.id, instance]));
    const enabled = !pluginId || composition.pluginInstances.some(instance => instance.pluginId === pluginId && instance.effectiveEnabled &&
      (!("slot" in implementation) || implementation.slot === undefined || (instance.target.type === "plugin_slot" && instance.target.slot === implementation.slot && parents.get(instance.target.parentInstanceId ?? "")?.pluginId === "conversation-surface")) &&
      (implementation.type !== "source-plugin" || (
        implementation.placement === "application" ? instance.target.type === "application" :
        implementation.placement === "layout" ? instance.target.type === "layout_slot" : instance.target.type === "plugin_slot"
      )));
    status = !sourceReady || !pluginReady ? "missing" : enabled ? "ready" : "disabled";
  }
  return { status, implementation, source: item, closure, packages, conflicts };
}

/** Public discovery DTO; never includes source paths or installation internals. */
export async function inspectOfficialAgentUIResourceCatalog(projectRoot: string) {
  const { inspectScenarioResources } = await import("./install-scenario-resources");
  const { inspectUIComposition } = await import("./project-inspector");
  const sources = await inspectScenarioResources(projectRoot);
  const composition = await inspectUIComposition(projectRoot);
  return officialResourceRegistry.resources.filter(resource => resource.discoverable === true).map(resource => {
    const { status } = inspectOfficialResourceImplementation(resource, composition, sources);
    return { id: resource.id, label: resource.label, ...(resource.description ? { description: resource.description } : {}),
      status, installable: status === "missing" || status === "disabled" };
  });
}
