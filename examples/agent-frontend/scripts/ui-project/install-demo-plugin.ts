import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { collectAppUIPluginLocations, parseAppUIModelJson } from "../../framework/contracts/app-ui-model";
import { writeGeneratedPluginRegistry } from "../generate-plugin-registry";
import { resolveAgentUIProjectPaths, projectControlConfigForPaths } from "./agent-ui-project-paths";
import { readAgentUIProjectConfig } from "./project-mode";
import { inspectAgentUISources, applyAgentUISourceItem } from "./source-registry";
import { mutateAppUIModel } from "./app-ui-transaction";
import type { AppUIOperation } from "./app-ui-operations";

/** Host adapter: reuse the same source and composition transactions as Creator tools. */
export async function installDemoPlugin(projectRoot: string, pluginId: string): Promise<void> {
  if (!["chart-message", "task-group", "job-progress-message", "agent-plan-message", "agent-status-message", "assistant-ui-reasoning", "assistant-ui-tool-group", "assistant-ui-tool-fallback"].includes(pluginId)) throw new Error("Unsupported Demo plugin");
  const project = await readAgentUIProjectConfig(projectRoot);
  const paths = resolveAgentUIProjectPaths(projectRoot, project.config);
  const config = projectControlConfigForPaths(paths);
  const sources = await inspectAgentUISources(projectRoot, config);
  const item = sources.items.find(entry => entry.id === `plugin/${pluginId}`);
  if (!item) throw new Error("插件库中没有找到对应插件。");
  if (item.status !== "managed" && item.status !== "customized") {
    await applyAgentUISourceItem(projectRoot, {
      itemId: item.id, expectedStateHash: sources.stateHash,
    }, config);
  }
  await writeGeneratedPluginRegistry(projectRoot);
  const source = await readFile(paths.appUIModelPath, "utf8");
  const model = parseAppUIModelJson(source);
  const locations = collectAppUIPluginLocations(model);
  const matches = locations.filter(entry => entry.plugin.pluginId === pluginId);
  if (matches.length > 1) throw new Error("项目中存在多个对应插件实例，请先处理重复实例。");
  const operations: AppUIOperation[] = [];
  const rendererSlots: Record<string, string> = {
    "task-group": "taskGroup", "assistant-ui-reasoning": "reasoningGroup",
    "assistant-ui-tool-group": "toolGroup", "assistant-ui-tool-fallback": "toolFallback",
  };
  const slot = rendererSlots[pluginId];
  if (slot) {
    const parents = locations.filter(entry => entry.plugin.pluginId === "conversation-surface");
    if (parents.length !== 1) throw new Error("无法唯一确定会话展示位置，请先恢复会话区域。");
    const target = { type: "plugin_slot" as const, parentInstanceId: parents[0]!.plugin.id, slot };
    const current = matches[0]?.target;
    if (current && (current.type !== "plugin_slot" || current.parentInstanceId !== target.parentInstanceId || current.slot !== slot)) {
      operations.push({ type: "move_plugin", instanceId: matches[0]!.plugin.id, target });
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
    operations.push(!slot
      ? { type: "insert_plugin", target: { type: "application" }, plugin: { id, pluginId, enabled: true } }
      : { type: "insert_plugin_default", plugin: { id, pluginId, enabled: true } });
  }
  if (operations.length) {
    await mutateAppUIModel(projectRoot, {
      appUIModelHash: createHash("sha256").update(source).digest("hex"), operations,
    });
  }
}
