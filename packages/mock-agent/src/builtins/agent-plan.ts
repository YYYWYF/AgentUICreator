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
    presentation: "assistant-ui AgentPlan",
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
        title: "Workspace update",
        steps: [
          { id: "inspect", label: "Inspect current implementation", description: "Trace the active data path." },
          { id: "compare", label: "Compare AG-UI runtime", description: "Check the pinned runtime contract." },
          { id: "update", label: "Update UI composition", description: "Render the authoritative plan activity." },
          { id: "regression", label: "Run regression checks", description: "Cover updates, invalid payloads and resume." },
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
