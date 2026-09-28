import type { OfficialAgentUIResource } from "@agent-ui/source-registry";
import { resourcePackageConflicts, type ResourcePackageRequirement } from "./ensure-resource-packages";

export interface ResourceCompositionInspection {
  pluginSources: readonly { pluginId: string; status: "available" | "missing"; dataMessageUINames: readonly string[] }[];
  pluginInstances: readonly { id: string; pluginId: string; enabled: boolean; effectiveEnabled: boolean; target: { type: string; parentInstanceId?: string; slot?: string } }[];
}
export interface ResourceSourceInspection {
  integrationRegistryReady?: boolean;
  items: readonly { id: string; status: string; installedVersion?: string; resolvedRequirements?: readonly ResourcePackageRequirement[]; dependencies?: readonly string[]; dependencyIssues?: readonly { code: string }[]; issues?: readonly { code: string }[] }[];
}

/** Only the caller's explicit diagnostics endpoint may serialize this internal result. */
export function inspectOfficialResourceImplementation(resource: OfficialAgentUIResource, composition: ResourceCompositionInspection, sources: ResourceSourceInspection) {
  const implementation = resource.implementation;
  const itemId = "sourceItemId" in implementation ? implementation.sourceItemId : `plugin/${implementation.pluginId}`;
  const item = sources.items.find(item => item.id === itemId);
  const closure = [item, ...(item?.dependencies ?? []).map(id => sources.items.find(item => item.id === id))];
  const packages = closure.flatMap(item => item?.resolvedRequirements ?? []);
  const conflicts = resourcePackageConflicts(packages);
  const blocked = closure.some(item => (implementation.type !== "plugin" && item?.status === "blocked") || item?.issues?.some(issue => issue.code === "AGENT_UI_PACKAGE_INCOMPATIBLE"));
  const duplicateProvider = implementation.type === "source-plugin" && composition.pluginInstances.filter(instance => instance.pluginId === implementation.pluginId).length > 1;
  let status: "ready" | "missing" | "disabled" | "conflict";
  if (conflicts.length || blocked || duplicateProvider) status = "conflict";
  else {
    const sourceReady = (implementation.type !== "source" || sources.integrationRegistryReady !== false) && (implementation.type === "plugin"
      ? item?.status !== "partial" && packages.every(item => item.compatible)
      : closure.every(item => item && ["managed", "customized"].includes(item.status) && !item.dependencyIssues?.length && !(item.resolvedRequirements ?? []).some(requirement => !requirement.compatible)));
    const pluginId = "pluginId" in implementation ? implementation.pluginId : undefined;
    const source = composition.pluginSources.find(source => source.pluginId === pluginId);
    const pluginReady = !pluginId || (source?.status === "available" &&
      (!("dataMessageUIName" in implementation) || implementation.dataMessageUIName === undefined || source.dataMessageUINames.includes(implementation.dataMessageUIName)));
    const parents = new Map(composition.pluginInstances.map(instance => [instance.id, instance]));
    const enabled = !pluginId || composition.pluginInstances.some(instance => instance.pluginId === pluginId && instance.effectiveEnabled &&
      (!("slot" in implementation) || implementation.slot === undefined || (instance.target.type === "plugin_slot" && instance.target.slot === implementation.slot && parents.get(instance.target.parentInstanceId ?? "")?.pluginId === "conversation-surface")) &&
      (implementation.type !== "source-plugin" || implementation.slot !== undefined || instance.target.type === "layout_slot"));
    status = !sourceReady || !pluginReady ? "missing" : enabled ? "ready" : "disabled";
  }
  return { status, implementation, source: item, closure, packages, conflicts };
}
