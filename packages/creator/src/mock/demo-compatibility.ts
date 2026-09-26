import { readFile, access } from "node:fs/promises";
import path from "node:path";

export interface MockProjectTarget {
  id: string;
  projectRoot: string;
  sourceRoot?: string;
}

export interface MockDemoCompatibility {
  canInstall?: boolean;
  projectId: string | null;
  status: "checked" | "unknown";
  requirements: Array<{
    pluginId: string;
    name: string;
    scenarioIds: string[];
    status: "ready" | "missing" | "disabled";
  }>;
}

const toolScenarios = ["reasoning-tool-success", "parallel-tools", "tool-error", "approval-resume", "agent-state-sync", "agent-plan", "agent-status", "nested-subagent-conversation", "nested-subagent-task-group", "nested-subagent-recursive", "nested-subagent-error"];
const reasoningScenarios = ["reasoning-chat", "reasoning-tool-success", "approval-resume", "agent-plan", "nested-subagent-conversation", "nested-subagent-task-group", "nested-subagent-recursive"];

export const mockDemoRequirements: ReadonlyArray<{ pluginId: string; name: string; scenarioIds: string[]; slot?: string }> = [
  { pluginId: "assistant-ui-reasoning", name: "推理展示资源", scenarioIds: reasoningScenarios, slot: "reasoningGroup" },
  { pluginId: "assistant-ui-tool-group", name: "工具分组资源", scenarioIds: toolScenarios, slot: "toolGroup" },
  { pluginId: "assistant-ui-tool-fallback", name: "工具调用与审批资源", scenarioIds: toolScenarios, slot: "toolFallback" },
  { pluginId: "chart-message", name: "图表插件", scenarioIds: ["data-message-chart"] },
  { pluginId: "job-progress-message", name: "进度展示资源", scenarioIds: ["agent-state-sync"] },
  { pluginId: "agent-plan-message", name: "计划展示资源", scenarioIds: ["agent-plan"] },
  { pluginId: "agent-status-message", name: "状态展示资源", scenarioIds: ["agent-status"] },
  { pluginId: "task-group", name: "任务卡片插件", scenarioIds: [
    "nested-subagent-conversation", "nested-subagent-task-group", "nested-subagent-recursive", "nested-subagent-error",
  ], slot: "taskGroup" },
];

/** Inspect project-owned source and composition; never install plugins for a Demo. */
export async function inspectMockDemoCompatibility(target?: MockProjectTarget): Promise<MockDemoCompatibility> {
  if (!target) return { projectId: null, status: "unknown", requirements: [] };
  try {
    let sourceRoot = target.sourceRoot;
    if (sourceRoot === undefined) {
      try {
        const project = JSON.parse(await readFile(path.join(target.projectRoot, ".agent-ui/project.json"), "utf8"));
        sourceRoot = typeof project.sourceRoot === "string" ? project.sourceRoot : ".";
      } catch { sourceRoot = "."; }
    }
    const source = path.resolve(target.projectRoot, sourceRoot ?? ".");
    const relative = path.relative(target.projectRoot, source);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Invalid source root");
    const model: unknown = JSON.parse(await readFile(path.join(source, "app-ui/app-ui.json"), "utf8"));
    const enabled = new Set<string>();
    // AppUIModel owns activation. Config payloads do not declare plugin instances.
    const composition = model as { applicationPlugins?: unknown; root?: unknown };
    function instances(node: unknown, parentEnabled = true, parentPluginId?: string, slot?: string) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach(child => instances(child, parentEnabled, parentPluginId, slot)); return; }
      const value = node as Record<string, unknown>;
      if (typeof value.pluginId === "string") {
        const active = parentEnabled && value.enabled === true;
        if (active) {
          enabled.add(value.pluginId);
          if (parentPluginId === "conversation-surface" && slot) enabled.add(`${value.pluginId}:${slot}`);
        }
        if (value.slots && typeof value.slots === "object") {
          for (const [childSlot, children] of Object.entries(value.slots)) instances(children, active, value.pluginId, childSlot);
        }
        return;
      }
      for (const [key, child] of Object.entries(value)) if (key !== "config") instances(child, parentEnabled, parentPluginId, slot);
    }
    instances(composition.applicationPlugins);
    instances(composition.root);
    const checked = await Promise.all(mockDemoRequirements.map(async (requirement) => {
      let installed = false;
      try {
        const directory = path.join(source, "plugins", requirement.pluginId);
        const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
        await access(path.join(directory, "definition.ts"));
        installed = manifest.id === requirement.pluginId &&
          (requirement.pluginId !== "chart-message" || manifest.data?.messageUI === true);
      } catch { /* Missing or invalid plugin source is not usable. */ }
      return { ...requirement, status: !installed ? "missing" as const
        : enabled.has(requirement.slot ? `${requirement.pluginId}:${requirement.slot}` : requirement.pluginId) ? "ready" as const : "disabled" as const };
    }));
    return { projectId: target.id, status: "checked", requirements: checked };
  } catch {
    return { projectId: target.id, status: "unknown", requirements: [] };
  }
}
