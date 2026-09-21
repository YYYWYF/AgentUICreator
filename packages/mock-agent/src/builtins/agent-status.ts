import { defineScenario } from "../scenario.js";

export const agentStatusScenario = defineScenario({
  id: "agent-status",
  title: "Custom Tool → AgentStatus",
  description: "用 application-defined tool result 驱动 assistant-ui AgentStatus。",
  category: "presentation",
  capabilities: ["tool", "agent-status"],
  reference: {
    protocol: "AG-UI Tool Call",
    pattern: "Application-defined Tool Result → Agent Element",
    presentation: "assistant-ui AgentStatus",
    eventFlow: [
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT",
      "application projector",
      "AgentStatus",
    ],
    notes: [
      "AG-UI does not define an AgentStatus event. This scenario demonstrates an application-defined tool contract rendered with assistant-ui AgentStatus.",
    ],
  },
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
