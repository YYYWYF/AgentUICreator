import { defineScenario } from "../scenario.js";

import { subagentFixture } from "./subagents.js";

export const subagentsOutOfOrderScenario = defineScenario({
  id: "subagents-out-of-order",
  title: "Subagents Out of Order",
  description: "验证完成计数只统计 completed prefix，不错位渲染进度。",
  category: "agent",
  capabilities: ["tool", "subagent"],
  steps: [
    {
      type: "tool",
      name: "mock_subagents",
      args: { view: "out-of-order" },
      result: {
        ...subagentFixture,
        agents: [
          { name: "Agent A", model: "mimo-v2.5-pro", status: "running", progress: 20 },
          { name: "Agent B", model: "mimo-v2.5-pro", status: "completed", progress: 100 },
          { name: "Agent C", model: "mimo-v2.5-pro", status: "running", progress: 55 },
        ],
      },
      prepareDurationMs: 200,
      durationMs: 600,
    },
    {
      type: "subagent",
      id: "out-of-order-b",
      name: "Agent B",
      durationMs: 200,
      outcome: { type: "completed" },
    },
    {
      type: "subagent",
      id: "out-of-order-a",
      name: "Agent A",
      durationMs: 300,
      outcome: { type: "error", message: "Agent A stopped for regression coverage" },
    },
    {
      type: "subagent",
      id: "out-of-order-c",
      name: "Agent C",
      durationMs: 300,
      outcome: { type: "completed" },
    },
    { type: "message", text: "非顺序子 Agent 状态已保留。", intervalMs: 30 },
  ],
});
