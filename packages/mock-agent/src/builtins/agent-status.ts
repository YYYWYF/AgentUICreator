import { defineScenario } from "../scenario.js";

export const agentStatusScenario = defineScenario({
  id: "agent-status",
  title: "Application-defined Tool Args → AgentStatus",
  description: "用 application-defined tool args 提供 AgentStatus 文案；state 由前端 ToolCall 状态推导。",
  category: "presentation",
  capabilities: ["tool", "agent-status"],
  reference: {
    audience: "frontend",
    protocol: "AG-UI Tool Call",
    pattern: "Application-defined Tool Args → AgentStatus",
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
      "AG-UI does not define an AgentStatus event. This scenario demonstrates an application-defined tool args contract rendered with assistant-ui AgentStatus.",
      "AgentStatus.state is derived from ConversationToolCallProps.status; label and elapsed come from props.args.",
    ],
  },
  steps: [
    {
      type: "tool",
      name: "mock_agent_status",
      args: { label: "Analyzing workspace", elapsed: "0:12" },
      result: { applied: true },
      prepareDurationMs: 250,
      durationMs: 1_800,
    },
    { type: "message", text: "状态展示完成。", intervalMs: 35 },
  ],
});
