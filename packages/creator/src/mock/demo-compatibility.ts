export interface MockProjectTarget {
  id: string;
  projectRoot: string;
  sourceRoot?: string;
}

export interface MockDemoCompatibility {
  canInstall?: boolean;
  canInstallResources?: boolean;
  projectId: string | null;
  status: "checked" | "unknown";
  requirements: MockDemoRequirement[];
}

export interface MockDemoRequirement {
  id: string;
  name: string;
  scenarioIds: string[];
  sourceItemId?: string;
  plugin?: { id: string; slot?: string };
  missingPackages?: readonly { name: string; required: string }[];
  status: "ready" | "missing" | "disabled";
}
export type MockDemoResource = Omit<MockDemoRequirement, "status" | "missingPackages">;

const toolScenarios = ["reasoning-tool-success", "parallel-tools", "tool-error", "approval-resume", "agent-state-sync", "agent-plan", "agent-status", "nested-subagent-conversation", "nested-subagent-task-group", "nested-subagent-recursive", "nested-subagent-error"];
const reasoningScenarios = ["reasoning-chat", "reasoning-tool-success", "approval-resume", "agent-plan", "nested-subagent-conversation", "nested-subagent-task-group", "nested-subagent-recursive"];

export const mockDemoRequirements: ReadonlyArray<MockDemoResource> = [
  { id: "frontend-tool-dialog", plugin: { id: "frontend-tool-dialog-demo" }, name: "Dialog Frontend Tool Demo", sourceItemId: "demo/frontend-tool-dialog", scenarioIds: ["frontend-tool-open-dialog"] },
  { id: "frontend-tool-form", plugin: { id: "frontend-tool-form-demo" }, name: "React Hook Form Demo", sourceItemId: "demo/frontend-tool-form", scenarioIds: ["frontend-tool-fill-form"] },
  { id: "assistant-ui-reasoning", plugin: { id: "assistant-ui-reasoning", slot: "reasoningGroup" }, name: "推理展示资源", scenarioIds: reasoningScenarios },
  { id: "assistant-ui-tool-group", plugin: { id: "assistant-ui-tool-group", slot: "toolGroup" }, name: "工具分组资源", scenarioIds: toolScenarios },
  { id: "assistant-ui-tool-fallback", plugin: { id: "assistant-ui-tool-fallback", slot: "toolFallback" }, name: "工具调用与审批资源", scenarioIds: toolScenarios },
  { id: "chart-message", plugin: { id: "chart-message" }, name: "图表插件", scenarioIds: ["data-message-chart"] },
  { id: "job-progress-message", plugin: { id: "job-progress-message" }, name: "进度展示资源", scenarioIds: ["agent-state-sync"] },
  { id: "agent-plan-message", plugin: { id: "agent-plan-message" }, name: "计划展示资源", scenarioIds: ["agent-plan"] },
  { id: "agent-status-message", plugin: { id: "agent-status-message" }, name: "状态展示资源", scenarioIds: ["agent-status"] },
  { id: "task-group", plugin: { id: "task-group", slot: "taskGroup" }, name: "任务卡片插件", scenarioIds: [
    "nested-subagent-conversation", "nested-subagent-task-group", "nested-subagent-recursive", "nested-subagent-error",
  ] },
];

/** Read-only projection of the formal protocol, deliberately excluding AppUIModel. */
export interface ProjectCompositionInspection {
  pluginSources: readonly { pluginId: string; status: "available" | "missing"; dataMessageUINames: readonly string[] }[];
  pluginInstances: readonly {
    id: string;
    pluginId: string;
    enabled: boolean;
    effectiveEnabled: boolean;
    target: { type: string; parentInstanceId?: string; slot?: string };
  }[];
}
export interface AgentUISourceInspection {
  items: readonly { id: string; status: string; resolvedRequirements?: readonly { name: string; required: string; compatible: boolean }[]; dependencies?: readonly string[]; dependencyIssues?: readonly { code: string }[] }[];
}
export type MockProjectInspector = (target: MockProjectTarget) => Promise<{
  composition: ProjectCompositionInspection;
  sources: AgentUISourceInspection;
}>;

/** Pure Demo requirements policy. All project facts come from formal inspection. */
export function inspectMockDemoCompatibility(
  snapshot: ProjectCompositionInspection,
  sourceInspection: AgentUISourceInspection,
  projectId: string | null = null,
  resources: readonly MockDemoResource[] = mockDemoRequirements,
): MockDemoCompatibility {
  const parents = new Map(snapshot.pluginInstances.map(instance => [instance.id, instance]));
  return {
    projectId, status: "checked",
    requirements: resources.map(requirement => {
      const plugin = requirement.plugin;
      const source = plugin && snapshot.pluginSources.find(source => source.pluginId === plugin.id);
      const item = sourceInspection.items.find(item => item.id === (requirement.sourceItemId ?? `plugin/${plugin?.id}`));
      const missingPackages = item?.resolvedRequirements?.filter(item => !item.compatible).map(({ name, required }) => ({ name, required })) ?? [];
      const closureReady = item?.dependencies?.every(id => sourceInspection.items.some(dependency => dependency.id === id && ["managed", "customized"].includes(dependency.status))) ?? true;
      const bundleReady = !requirement.sourceItemId || (item && ["managed", "customized"].includes(item.status) && missingPackages.length === 0 && closureReady && !item.dependencyIssues?.length);
      const installed = bundleReady && (!plugin || (source?.status === "available" && item?.status !== "partial" &&
        (plugin.id !== "chart-message" || source.dataMessageUINames.includes("chart"))));
      const ready = !plugin || snapshot.pluginInstances.some(instance =>
        instance.pluginId === plugin.id && instance.effectiveEnabled &&
        (plugin.slot === undefined ||
          (instance.target.type === "plugin_slot" && instance.target.slot === plugin.slot &&
            parents.get(instance.target.parentInstanceId ?? "")?.pluginId === "conversation-surface")));

      return { ...requirement, ...(requirement.sourceItemId ? { missingPackages } : {}), status: !installed ? "missing" as const : ready ? "ready" as const : "disabled" as const };
    }),
  };
}

export async function inspectMockProjectCompatibility(target: MockProjectTarget | undefined, inspector: MockProjectInspector): Promise<MockDemoCompatibility> {
  if (!target) return { projectId: null, status: "unknown", requirements: [] };
  try {
    const { composition, sources } = await inspector(target);
    return inspectMockDemoCompatibility(composition, sources, target.id);
  } catch {
    return { projectId: target.id, status: "unknown", requirements: [] };
  }
}
