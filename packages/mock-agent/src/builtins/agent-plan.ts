import { defineScenario } from "../scenario.js";

export const agentPlanScenario = defineScenario({
  id: "agent-plan",
  title: "Application-defined Tool Args → AgentPlan",
  description: "用 application-defined tool args 驱动 assistant-ui AgentPlan；Tool Result 只确认应用已应用。",
  category: "presentation",
  capabilities: ["tool", "plan"],
  reference: {
    audience: "frontend",
    protocol: "AG-UI Tool Call",
    pattern: "Application-defined Tool Args → AgentPlan",
    presentation: "assistant-ui AgentPlan",
    eventFlow: [
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "application projector → AgentPlan",
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT (acknowledgement)",
    ],
    notes: [
      "AG-UI does not define an AgentPlan event. This scenario demonstrates an application-defined tool args contract rendered with assistant-ui AgentPlan.",
      "AgentPlan can render from Tool Args before TOOL_CALL_RESULT arrives.",
      "TOOL_CALL_RESULT only acknowledges that the application-defined plan command settled.",
      "application projector → AgentPlan is a frontend presentation step, not an AG-UI wire event.",
    ],
  },
  steps: [
    {
      type: "reasoning",
      text: "我先制定执行计划，再按当前步骤继续处理。",
      durationMs: 600,
    },
    {
      type: "tool",
      name: "mock_agent_plan",
      args: {
        steps: [
          "Inspect current implementation",
          "Compare AG-UI runtime",
          "Update UI composition",
          "Run regression checks",
        ],
        activeIndex: 2,
      },
      result: { applied: true },
      prepareDurationMs: 300,
      durationMs: 3_000,
    },
    { type: "message", text: "计划已经生成，当前正在处理第三步。", intervalMs: 35 },
  ],
});
