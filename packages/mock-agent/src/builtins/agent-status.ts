import { defineScenario } from "../scenario.js";

export const agentStatusScenario = defineScenario({
  id: "agent-status",
  title: "Agent Status",
  description: "依次展示 working、waiting、done 三个显式状态。",
  category: "agent",
  capabilities: ["tool", "agent-status"],
  steps: [
    {
      type: "tool",
      name: "mock_agent_status",
      args: { phase: "working" },
      result: { state: "working", label: "Analyzing workspace", elapsed: "0:12" },
      prepareDurationMs: 250,
      durationMs: 900,
    },
    {
      type: "tool",
      name: "mock_agent_status",
      args: { phase: "waiting" },
      result: { state: "waiting", label: "Waiting for dependency", elapsed: "0:18" },
      prepareDurationMs: 250,
      durationMs: 900,
    },
    {
      type: "tool",
      name: "mock_agent_status",
      args: { phase: "done" },
      result: { state: "done", label: "Analysis complete", elapsed: "0:24" },
      prepareDurationMs: 250,
      durationMs: 900,
    },
    { type: "message", text: "状态展示完成。", intervalMs: 35 },
  ],
});
