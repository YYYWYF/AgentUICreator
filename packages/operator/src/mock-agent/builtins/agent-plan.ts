import { defineScenario } from "../scenario.js";

export const agentPlanScenario = defineScenario({
  id: "agent-plan",
  resources: ["agent-plan-message"],
  title: "AG-UI Activity → AgentPlan",
  description: "通过标准 AG-UI Activity 快照和增量权威更新 AgentPlan。",
  category: "presentation",
  capabilities: ["plan"],
  reference: {
    audience: "frontend",
    protocol: "AG-UI ACTIVITY_SNAPSHOT / ACTIVITY_DELTA",
    pattern: "Authoritative Agent Plan Activity",
    presentation: "Agent UI AgentPlan",
    eventFlow: [
      "RUN_STARTED",
      "ACTIVITY_SNAPSHOT (agent-plan)",
      "ACTIVITY_DELTA (activeIndex)",
      "ACTIVITY_DELTA (activeIndex)",
      "ACTIVITY_DELTA (activeIndex)",
      "ACTIVITY_DELTA (all done)",
      "TEXT_MESSAGE_*",
      "RUN_FINISHED",
    ],
    notes: [
      "The backend owns the complete plan and each activeIndex update.",
      "The frontend renders only validated agui-activity/agent-plan data and does not infer progress from Tools, reasoning or elapsed time.",
      "A resumed live run must replay the latest complete ACTIVITY_SNAPSHOT before later ACTIVITY_DELTA events.",
    ],
  },
  steps: [
    {
      type: "activity-snapshot",
      messageId: "agent-plan-1",
      activityType: "agent-plan",
      replace: true,
      content: {
        title: "工作区更新",
        steps: [
          { id: "inspect", label: "检查当前实现", description: "追踪当前数据流。" },
          { id: "compare", label: "核对 AG-UI Runtime", description: "检查固定版本的 Runtime 契约。" },
          { id: "update", label: "更新 UI 组合", description: "渲染权威计划事件。" },
          { id: "regression", label: "执行回归检查", description: "覆盖更新、无效数据和恢复场景。" },
        ],
        activeIndex: 0,
      },
    },
    {
      type: "activity-delta",
      messageId: "agent-plan-1",
      activityType: "agent-plan",
      patch: [{ op: "replace", path: "/activeIndex", value: 1 }],
      delayMs: 700,
    },
    {
      type: "activity-delta",
      messageId: "agent-plan-1",
      activityType: "agent-plan",
      patch: [{ op: "replace", path: "/activeIndex", value: 2 }],
      delayMs: 700,
    },
    {
      type: "activity-delta",
      messageId: "agent-plan-1",
      activityType: "agent-plan",
      patch: [{ op: "replace", path: "/activeIndex", value: 3 }],
      delayMs: 700,
    },
    {
      type: "activity-delta",
      messageId: "agent-plan-1",
      activityType: "agent-plan",
      patch: [{ op: "replace", path: "/activeIndex", value: 4 }],
      delayMs: 700,
    },
    { type: "message", text: "计划已经生成，当前正在处理第三步。", intervalMs: 35 },
  ],
});
