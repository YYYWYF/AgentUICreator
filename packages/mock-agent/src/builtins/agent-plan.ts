import { defineScenario } from "../scenario.js";

export const agentPlanScenario = defineScenario({
  id: "agent-plan",
  title: "Agent Plan",
  description: "用 Mock Agent backend tool 驱动 official AgentPlan。",
  category: "agent",
  capabilities: ["reasoning", "tool", "plan"],
  steps: [
    {
      type: "reasoning",
      text: "我先制定执行计划，再按当前步骤继续处理。",
      durationMs: 600,
    },
    {
      type: "tool",
      name: "mock_agent_plan",
      args: { source: "p5-a" },
      result: {
        steps: [
          "Inspect current implementation",
          "Compare AG-UI runtime",
          "Update UI composition",
          "Run regression checks",
        ],
        activeIndex: 2,
      },
      prepareDurationMs: 300,
      durationMs: 3_000,
    },
    { type: "message", text: "计划已经生成，当前正在处理第三步。", intervalMs: 35 },
  ],
});
