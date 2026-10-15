import { defineScenario } from "../scenario.js";

/** Server-owned Activity snapshot used by the refresh/resume regression. */
export const resumableAgentPlanScenario = defineScenario({
  id: "resumable-agent-plan",
  durableRun: true,
  resources: ["agent-plan-message"],
  title: "AgentPlan Activity：刷新后继续",
  description: "刷新后恢复同一个 Run 的最新 Activity 快照，并继续接收增量。",
  category: "advanced",
  capabilities: ["plan"],
  reference: {
    audience: "frontend",
    protocol: "AG-UI ACTIVITY_SNAPSHOT / ACTIVITY_DELTA",
    pattern: "Resume the existing AgentPlan Activity",
    presentation: "assistant-ui AgentPlan",
    eventFlow: [
      "RUN_STARTED",
      "ACTIVITY_SNAPSHOT (activeIndex: 0)",
      "ACTIVITY_DELTA (activeIndex: 1)",
      "refresh and reattach the same Run",
      "ACTIVITY_SNAPSHOT (activeIndex: 1)",
      "ACTIVITY_DELTA (activeIndex: 2)",
      "ACTIVITY_DELTA (activeIndex: 3)",
      "RUN_FINISHED",
    ],
    notes: [
      "The backend owns the latest complete Activity snapshot and resumes the existing run without another Agent invocation.",
      "Progress is not inferred from Tool Args or reasoning text.",
    ],
  },
  steps: [],
});
