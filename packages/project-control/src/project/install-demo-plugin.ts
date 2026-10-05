import { createHash } from "node:crypto";
import { officialResourceRegistry } from "@agent-ui/source-registry";
import { readFile } from "node:fs/promises";
import { collectPluginAssets } from "./plugin-assets";
import { collectAppUIPluginLocations, parseAppUIModelJson } from "../framework/contracts/app-ui-model";
import { resolveAgentUIProjectPaths, projectControlConfigForPaths } from "./agent-ui-project-paths";
import { readAgentUIProjectConfig } from "./project-mode";
import { inspectAgentUISources } from "./source-registry/index";
import { applyAgentUISourceProjectMutation, recoverPendingAgentUISourceProjectMutation } from "./source-registry/project-mutation";
import { mutateAppUIModel } from "./app-ui-transaction";
import type { AppUIOperation } from "./app-ui-operations";

/** Host adapter: reuse the same source and composition transactions as Creator tools. */
export async function installDemoPlugin(projectRoot: string, pluginId: string): Promise<void> {
  const resource = officialResourceRegistry.resources.find(resource => resource.implementation.type === "plugin" && resource.implementation.pluginId === pluginId);
  if (!resource || resource.implementation.type !== "plugin") throw new Error("Unsupported Demo plugin");
  const project = await readAgentUIProjectConfig(projectRoot);
  const paths = resolveAgentUIProjectPaths(projectRoot, project.config);
  const config = projectControlConfigForPaths(paths);
  await recoverPendingAgentUISourceProjectMutation(projectRoot, config);
  const sources = await inspectAgentUISources(projectRoot, config);
  const item = sources.items.find(entry => entry.id === `plugin/${pluginId}`);
  if (!item) throw new Error("插件库中没有找到对应插件。");
  // Existing customized Demo code can still be selected through composition;
  // it is not a Source synchronization request.
  if (item.status !== "customized") {
    await applyAgentUISourceProjectMutation(projectRoot, {
      itemId: item.id, expectedStateHash: sources.stateHash,
    }, { config });
  }
  const source = await readFile(paths.appUIModelPath, "utf8");
  const model = parseAppUIModelJson(source);
  const locations = collectAppUIPluginLocations(model);
  const matches = locations.filter(entry => entry.plugin.pluginId === pluginId);
  if (matches.length > 1) throw new Error("项目中存在多个对应插件实例，请先处理重复实例。");
  const operations: AppUIOperation[] = [];
  const inventory = await collectPluginAssets(projectRoot, paths, config);
  const assets = inventory.assets.filter(asset => asset.pluginId === pluginId);
  if (assets.length !== 1) throw new Error("无法唯一确定插件 Manifest。");
  const placement = assets[0]!.authoring?.defaultPlacement;
  const slot = placement?.type === "plugin_slot" ? placement.slot : undefined;
  if (placement?.type === "plugin_slot") {
    const parents = locations.filter(entry => entry.plugin.pluginId === placement.parentPluginId);
    if (parents.length !== 1) throw new Error("无法唯一确定会话展示位置，请先恢复会话区域。");
    const target = { type: "plugin_slot" as const, parentInstanceId: parents[0]!.plugin.id, slot: placement.slot };
    const current = matches[0]?.target;
    if (current && (current.type !== "plugin_slot" || current.parentInstanceId !== target.parentInstanceId || current.slot !== slot)) {
      operations.push({ type: "move_plugin_to", instanceId: matches[0]!.plugin.id, placement: target });
    }
    let parent = parents[0];
    while (parent) {
      if (!parent.plugin.enabled) operations.push({ type: "set_plugin_enabled", instanceId: parent.plugin.id, enabled: true });
      const parentId: string | undefined = parent.target.type === "plugin_slot" ? parent.target.parentInstanceId : undefined;
      parent = parentId === undefined ? undefined : locations.find(entry => entry.plugin.id === parentId);
    }
  }
  let location = matches[0];
  if (location) {
    while (location) {
      if (!location.plugin.enabled) operations.push({ type: "set_plugin_enabled", instanceId: location.plugin.id, enabled: true });
      const parentId: string | undefined = location.target.type === "plugin_slot" ? location.target.parentInstanceId : undefined;
      location = slot || parentId === undefined ? undefined : locations.find(entry => entry.plugin.id === parentId);
    }
  } else {
    const ids = new Set(locations.map(entry => entry.plugin.id));
    let id = `${pluginId}-main`;
    for (let suffix = 2; ids.has(id); suffix++) id = `${pluginId}-main-${suffix}`;
    operations.push(!placement
      ? { type: "insert_plugin", target: { type: "application" }, plugin: { id, pluginId, enabled: true } }
      : { type: "insert_plugin_default", plugin: { id, pluginId, enabled: true } });
  }
  if (operations.length) {
    await mutateAppUIModel(projectRoot, {
      appUIModelHash: createHash("sha256").update(source).digest("hex"), operations,
    });
  }
}
