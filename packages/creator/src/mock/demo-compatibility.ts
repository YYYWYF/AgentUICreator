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
  requirements: Array<{
    pluginId: string;
    sourceItemId?: string;
    missingPackages?: readonly { name: string; required: string }[];
    name: string;
    scenarioIds: string[];
    status: "ready" | "missing" | "disabled";
  }>;
}

const toolScenarios = ["reasoning-tool-success", "parallel-tools", "tool-error", "approval-resume", "agent-state-sync", "agent-plan", "agent-status", "nested-subagent-conversation", "nested-subagent-task-group", "nested-subagent-recursive", "nested-subagent-error"];
const reasoningScenarios = ["reasoning-chat", "reasoning-tool-success", "approval-resume", "agent-plan", "nested-subagent-conversation", "nested-subagent-task-group", "nested-subagent-recursive"];

export const mockDemoRequirements: ReadonlyArray<{ pluginId: string; name: string; scenarioIds: string[]; slot?: string; sourceItemId?: string }> = [
  { pluginId: "frontend-tool-dialog-demo", name: "Dialog Frontend Tool Demo", sourceItemId: "demo/frontend-tool-dialog", scenarioIds: ["frontend-tool-open-dialog"] },
  { pluginId: "frontend-tool-form-demo", name: "React Hook Form Demo", sourceItemId: "demo/frontend-tool-form", scenarioIds: ["frontend-tool-fill-form"] },
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
  items: readonly { id: string; status: string; requirements?: readonly { name: string; required: string; compatible: boolean }[] }[];
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
): MockDemoCompatibility {
  const parents = new Map(snapshot.pluginInstances.map(instance => [instance.id, instance]));
  return {
    projectId, status: "checked",
    requirements: mockDemoRequirements.map(requirement => {
      const source = snapshot.pluginSources.find(source => source.pluginId === requirement.pluginId);
      const item = sourceInspection.items.find(item => item.id === (requirement.sourceItemId ?? `plugin/${requirement.pluginId}`));
      const missingPackages = item?.requirements?.filter(item => !item.compatible).map(({ name, required }) => ({ name, required })) ?? [];
      const bundleReady = !requirement.sourceItemId || (item && ["managed", "customized"].includes(item.status) && missingPackages.length === 0);
      const installed = bundleReady && source?.status === "available" && item?.status !== "partial" &&
        (requirement.pluginId !== "chart-message" || source.dataMessageUINames.includes("chart"));
      const ready = snapshot.pluginInstances.some(instance =>
        instance.pluginId === requirement.pluginId && instance.effectiveEnabled &&
        (requirement.slot === undefined ||
          (instance.target.type === "plugin_slot" && instance.target.slot === requirement.slot &&
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
