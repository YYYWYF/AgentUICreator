import { OfficialResourceError, type OfficialAgentUIResource } from "./official-resource.js";
import type { LoadedAgentUISourceRegistry } from "./types.js";
import { resolveAgentUISourceItemClosure } from "./closure.js";
import { officialPackagePlugin } from "./package-plugins.js";

export function createOfficialResourceRegistry(resources: readonly OfficialAgentUIResource[]) {
  const byId = new Map<string, OfficialAgentUIResource>();
  const implementationOwners = new Map<string, string>();
  for (const resource of resources) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resource.id) || !resource.label.trim()) throw new Error("Invalid official resource ID or label.");
    if (byId.has(resource.id)) throw new Error(`Duplicate official resource: ${resource.id}`);
    const delivery = resource.implementation.type === "plugin"
      ? officialPackagePlugin(resource.implementation.pluginId) : undefined;
    const implementation = delivery
      ? { ...resource.implementation, runtime: delivery.runtime, referenceSourceItemId: delivery.referenceSourceItemId }
      : resource.implementation;
    if (!["source", "plugin", "source-plugin"].includes(implementation.type)) throw new Error(`Invalid resource implementation: ${resource.id}`);
    if (implementation.type !== "plugin" && (!("sourceItemId" in implementation) || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(implementation.sourceItemId))) throw new Error(`Invalid resource source: ${resource.id}`);
    if (implementation.type !== "source" && (!("pluginId" in implementation) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(implementation.pluginId) || (implementation.slot !== undefined && !implementation.slot.trim()))) throw new Error(`Invalid resource Plugin: ${resource.id}`);
    if (implementation.type === "source-plugin" && (
      !["application", "layout", "plugin-slot"].includes(implementation.placement) ||
      (implementation.placement === "plugin-slot") !== (implementation.slot !== undefined) ||
      (implementation.placement !== "layout" && implementation.layoutSize !== undefined)
    )) throw new Error(`Invalid resource placement: ${resource.id}`);
    const keys = [
      `source:${"sourceItemId" in implementation ? implementation.sourceItemId : `plugin/${implementation.pluginId}`}`,
      ...("pluginId" in implementation ? [`plugin:${implementation.pluginId}`] : []),
    ];
    for (const key of keys) {
      if (implementationOwners.has(key)) throw new Error(`Conflicting official resource implementation: ${key}`);
      implementationOwners.set(key, resource.id);
    }
    byId.set(resource.id, Object.freeze({ ...resource, ...(resource.targets === undefined ? {} : { targets: Object.freeze([...resource.targets]) }), implementation: Object.freeze({ ...implementation }) }));
  }
  return Object.freeze({
    resources: Object.freeze([...byId.values()]),
    resolve(id: string): OfficialAgentUIResource {
      const resource = byId.get(id);
      if (!resource) throw new OfficialResourceError("RESOURCE_UNKNOWN", `Unknown official Agent UI resource: ${id}`);
      return resource;
    },
  });
}

export const officialResourceRegistry = createOfficialResourceRegistry([
  { id: "conversation-composer", label: "Composer", discoverable: true, implementation: { type: "plugin", pluginId: "assistant-ui-composer", slot: "composer" } },
  { id: "web-component-bridge", kind: "compatibility", targets: ["vue", "legacy", "html"], discoverable: true, label: "Web Component Compatibility", implementation: { type: "source", sourceItemId: "integration/web-component-bridge" } },
  { id: "web-search", discoverable: true, label: "网页搜索", implementation: { type: "source-plugin", sourceItemId: "plugin/web-search", pluginId: "web-search", placement: "application" } },
  { id: "retrieval-chunks", discoverable: true, label: "文档检索", implementation: { type: "source-plugin", sourceItemId: "plugin/retrieval-chunks", pluginId: "retrieval-chunks", placement: "application" } },
  { id: "a2ui", label: "A2UI", description: "A2UI declarative interactive surfaces", implementation: { type: "source", sourceItemId: "integration/a2ui" } },
  { id: "ask-user-question-demo", label: "询问用户偏好 Demo", implementation: { type: "source-plugin", sourceItemId: "demo/ask-user-question", pluginId: "ask-user-question-demo", placement: "application" } },
  { id: "frontend-tool-form-demo", label: "表单 Frontend Tool Demo", implementation: { type: "source-plugin", sourceItemId: "demo/frontend-tool-form", pluginId: "frontend-tool-form-demo", placement: "layout", layoutSize: "320px" } },
  { id: "frontend-tool-dialog-demo", label: "弹窗 Frontend Tool Demo", implementation: { type: "source-plugin", sourceItemId: "demo/frontend-tool-dialog", pluginId: "frontend-tool-dialog-demo", placement: "layout", layoutSize: "0px" } },
  { id: "source-citations-message", discoverable: true, label: "来源引用", implementation: { type: "plugin", pluginId: "source-citations-message" } },
  { id: "generated-file-message", discoverable: true, label: "文件输出", implementation: { type: "plugin", pluginId: "generated-file-message" } },
  { id: "conversation-edit-lexical", label: "历史消息编辑 Chip", implementation: { type: "plugin", pluginId: "assistant-ui-lexical-edit-composer" } },
  { id: "conversation-lexical-input", label: "输入态提及 Chip", implementation: { type: "plugin", pluginId: "assistant-ui-lexical-composer-input" } },
  { id: "conversation-mention", label: "提及对象", implementation: { type: "plugin", pluginId: "assistant-ui-mention-trigger" } },
  { id: "conversation-slash-commands", label: "斜杠命令", implementation: { type: "plugin", pluginId: "assistant-ui-slash-command-trigger" } },
  { id: "conversation-command-source", label: "会话命令来源", implementation: { type: "plugin", pluginId: "conversation-command-source" } },
  { id: "composer-trigger-demo", label: "输入触发器 Demo", implementation: { type: "source-plugin", sourceItemId: "demo/composer-triggers", pluginId: "composer-trigger-demo", placement: "application" } },
  { id: "message-feedback", discoverable: true, label: "消息反馈", implementation: { type: "plugin", pluginId: "assistant-ui-feedback-actions" } },
  { id: "conversation-quote", discoverable: true, label: "引用回复", implementation: { type: "plugin", pluginId: "conversation-quote" } },
  { id: "reasoning", discoverable: true, label: "推理展示", implementation: { type: "plugin", pluginId: "assistant-ui-reasoning", slot: "reasoningGroup" } },
  { id: "tool-group", discoverable: true, label: "工具分组", implementation: { type: "plugin", pluginId: "assistant-ui-tool-group", slot: "toolGroup" } },
  { id: "tool-approval", discoverable: true, label: "工具调用与审批", implementation: { type: "plugin", pluginId: "assistant-ui-tool-fallback", slot: "toolFallback" } },
  { id: "chart-message", discoverable: true, label: "图表", implementation: { type: "plugin", pluginId: "chart-message", dataMessageUIName: "chart" } },
  { id: "job-progress-message", discoverable: true, label: "进度展示", implementation: { type: "plugin", pluginId: "job-progress-message" } },
  { id: "agent-plan-message", discoverable: true, label: "计划展示", implementation: { type: "plugin", pluginId: "agent-plan-message" } },
  { id: "agent-status-message", discoverable: true, label: "状态展示", implementation: { type: "plugin", pluginId: "agent-status-message" } },
  { id: "task-group", discoverable: true, label: "任务卡片", implementation: { type: "plugin", pluginId: "task-group", slot: "taskGroup" } },
]);

export const resolveOfficialResource = (id: string): OfficialAgentUIResource => officialResourceRegistry.resolve(id);

/** Maintenance/build check for reference source availability. */
export function validateOfficialResourceSources(sources: LoadedAgentUISourceRegistry): void {
  for (const resource of officialResourceRegistry.resources) {
    const implementation = resource.implementation;
    const itemId = "sourceItemId" in implementation ? implementation.sourceItemId : `plugin/${implementation.pluginId}`;
    if (!sources.byId.has(itemId)) throw new Error(`Official resource ${resource.id} has unavailable source ${itemId}.`);
    if (implementation.type !== "source") {
      const files = resolveAgentUISourceItemClosure(sources, itemId).flatMap(item => item.loadedFiles);
      const prefix = `plugins/${implementation.pluginId}/`;
      const manifest = files.find(file => file.target === `${prefix}manifest.json`);
      if (!manifest || JSON.parse(manifest.content.toString("utf8")).id !== implementation.pluginId || !files.some(file => file.target === `${prefix}definition.ts`)) {
        throw new Error(`Official resource ${resource.id} has invalid Plugin source ${implementation.pluginId}.`);
      }
    }
  }
}
