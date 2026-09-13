import { defineScenario } from "../scenario.js";

import { subagentDispatchTool } from "./subagents.js";

export const subagentsOutOfOrderScenario = defineScenario({
  id: "subagents-out-of-order",
  title: "Subagents Out of Order",
  description: "验证多个 dispatch tool call 的完成顺序不改变聚合进度。",
  category: "agent",
  capabilities: ["tool", "subagent"],
  steps: [
    {
      type: "parallel-tools",
      tools: [
        subagentDispatchTool({
          id: "out-of-order-a",
          name: "Agent A",
          progress: 20,
          durationMs: 300,
        }),
        subagentDispatchTool({
          id: "out-of-order-b",
          name: "Agent B",
          progress: 100,
          durationMs: 100,
        }),
        subagentDispatchTool({
          id: "out-of-order-c",
          name: "Agent C",
          progress: 55,
          durationMs: 300,
        }),
      ],
    },
    { type: "message", text: "非顺序子 Agent 状态已保留。", intervalMs: 30 },
  ],
});
