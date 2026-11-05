import { inspectProject, runtimeObservationNavigation } from "./inspection.js";
import { rememberProjectTargets } from "./editing-session.js";
import { logicalProjectPath } from "./project-read.js";
import type { ToolContext } from "./tools.js";
import { pluginTargetNames } from "./plugin-target-names.js";
import { enUS } from "../ui/i18n/en-US.js";
import { zhCN } from "../ui/i18n/zh-CN.js";

/** Project facts for navigation, without Plugin source, API schemas or execution plans. */
export function projectPluginDirectory(project: Record<string, any>) {
  if (!Array.isArray(project.capabilitySummaries) || !Array.isArray(project.pluginInstances)) {
    throw new Error("CREATOR_PLUGIN_DIRECTORY_UNAVAILABLE");
  }
  const catalog = project.authoringTargetCatalog;
  const bindings: any[] = catalog?.bindings ?? [];
  const instances: any[] = project.pluginInstances;
  const sources = new Map((project.pluginSources ?? []).map((item: any) => [item.pluginId, item.status]));
  const capabilities = new Map<string, any>(project.capabilitySummaries.map((item: any) => [item.pluginId, item]));
  // Keep composed identities visible even when their source is missing.
  for (const item of [...instances, ...(project.pluginSources ?? [])]) {
    if (!capabilities.has(item.pluginId)) capabilities.set(item.pluginId, { pluginId: item.pluginId });
  }
  const locations = new Map<string, object>();
  const visit = (node: any, location: string, parent?: any, index?: number | string) => {
    if (!node || typeof node !== "object") return;
    if (node.nodeRef) locations.set(node.nodeRef, { path: location,
      ...(parent ? { parentNodeRef: parent.nodeRef, parentType: parent.type, index,
        ...(typeof index === "number" && parent.sizes?.[index] !== undefined ? { parentTrackSize: parent.sizes[index] } : {}) } : {}) });
    for (const [i, child] of (node.children ?? []).entries()) visit(child, `${location}.children[${i}]`, node, i);
    if (node.child) visit(node.child, `${location}.child`, node, "child");
    if (node.type === "sidebar") {
      for (const key of ["header", "content", "footer"]) visit(node[key], `${location}.${key}`, node, key);
      for (const [i, item] of (node.items ?? []).entries()) visit(item.child, `${location}.items[${i}].child`, node, i);
    }
  };
  visit(project.appUIModel?.layout, "root");
  const virtualPath = (value?: string) => value ? "/" + logicalProjectPath(value.replaceAll("\\", "/")) : undefined;
  const plugins = [...capabilities.values()].map(item => {
    const current = instances.filter(instance => instance.pluginId === item.pluginId);
    const binding = bindings.find(binding => binding.kind === "plugin_source" && binding.pluginId === item.pluginId);
    const displayNames = [zhCN.commands, enUS.commands].flatMap(locale => {
      const name = (locale as Record<string, unknown>)[`plugin_${item.pluginId}`];
      return typeof name === "string" ? [name] : [];
    });
    return { pluginId: item.pluginId, name: item.name ?? item.pluginId, description: item.description,
      targetNames: pluginTargetNames({ ...item, targetNames: [...(item.targetNames ?? []), ...displayNames] }),
      intents: item.authoring?.intents, role: item.authoring?.visualRole,
      ...(item.componentPresentation ? { componentPresentation: item.componentPresentation } : {}),
      state: !current.length ? "not_composed" : current.some(instance => instance.effectiveEnabled ?? instance.enabled !== false) ? "enabled" : "disabled",
      sourceStatus: sources.get(item.pluginId), applicationPath: virtualPath(binding?.ownerPath),
      ...(binding?.ownerPath ? {} : { definitionPath: virtualPath(binding?.definitionPath) }),
      defaultPlacement: item.authoring?.defaultPlacement,
      ...(item.requiredServices?.names?.length ? { requiredServices: item.requiredServices } : {}),
      instances: current.map(({ id, enabled, effectiveEnabled, target, index }) => ({ id, enabled, effectiveEnabled, target, index,
        ...(target?.type === "layout_slot" ? { layout: locations.get(target.slotRef) } : {}) })),
    };
  });
  return { status: "available", coverage: "current-project-capabilities", sourceRoot: project.sourceRoot,
    capabilityCatalogRevision: project.capabilityCatalogRevision, appUIModelHash: project.appUIModel?.hash,
    counts: {
      total: plugins.length,
      composed: plugins.filter(plugin => plugin.state !== "not_composed").length,
      enabled: plugins.filter(plugin => plugin.state === "enabled").length,
      disabled: plugins.filter(plugin => plugin.state === "disabled").length,
      notComposed: plugins.filter(plugin => plugin.state === "not_composed").length,
      instances: instances.length,
    },
    plugins,
    applicationTargets: (catalog?.candidates ?? []).filter((item: any) => item.kind === "application_config").map((item: any) => ({
      id: item.id, name: item.name, description: item.description, intents: item.intents, relatedPluginIds: item.relatedPluginIds,
      path: virtualPath(bindings.find(binding => binding.targetId === item.id)?.ownerPath),
    })),
    details: { plugin: "inspect_ui_plugin", composition: "inspect_ui_project", additionalCapabilities: "inspect_ui_capabilities" },
    evidenceBoundary: "Current project metadata only. Source files, API contracts, runtime behavior and validation were not read or verified. Metadata grants no mutation or source takeover authorization.",
  };
}

export async function preparePluginDirectory(context: ToolContext) {
  try {
    const project = await inspectProject(context, { view: "composition" });
    const directory = projectPluginDirectory(project);
    await rememberProjectTargets(context, project);
    // This is the same read as a Composition tool inspection; exposure is not authority.
    context.groups.add("composition");
    return { ...directory, ...(context.verificationMode === "static_and_runtime" ? { runtimeObservation: runtimeObservationNavigation(project) } : {}) };
  } catch (error) {
    context.signal.throwIfAborted();
    // Broken/uninitialized projects still retain ordinary inspection and repair tools.
    return { status: "unavailable", reason: (error as any)?.code ?? (error as Error).message.split(":")[0],
      nextTool: "inspect_ui_project", coverage: "unknown" };
  }
}

/** The model gets an owner/name index; full matching and authoring facts stay Host-side. */
export function pluginDirectoryNavigation(directory: any) {
  if (!Array.isArray(directory?.plugins)) return directory;
  return { ...directory, plugins: directory.plugins.map((plugin: any) => Object.fromEntries(
    ["pluginId", "name", "description", "targetNames", "state", "sourceStatus", "applicationPath", "definitionPath", "instances"]
      .filter(key => plugin[key] !== undefined).map(key => [key, plugin[key]]))),
    omittedDetails: "Use inspect_ui_plugin for authoring placement, Service contracts and presentation details of a specific Plugin." };
}
