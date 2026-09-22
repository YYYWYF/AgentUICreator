import { defineScenario } from "../scenario.js";

export const nestedSubagentErrorScenario = defineScenario({
  id: "nested-subagent-error",
  title: "AG-UI Subagent Error",
  description: "展示带有归属内容的 SUBAGENT_ERROR nested reference case：nested assistant message 标记为 incomplete/error，保留错误前的 transcript。",
  category: "advanced",
  capabilities: ["tool", "subagent"],
  reference: {
    protocol: "AG-UI",
    pattern: "Nested Subagent Error",
    presentation: "assistant-ui TaskCard with nested error",
    level: "edge",
    eventFlow: [
      "TOOL_CALL_*",
      "SUBAGENT_STARTED",
      "Attributed child message",
      "SUBAGENT_ERROR",
      "Parent TOOL_CALL_RESULT",
    ],
    notes: [
      "SUBAGENT_ERROR does not remove attributed nested content.",
      "SUBAGENT_ERROR marks the nested assistant message incomplete/error.",
      "If the parent ToolCall subsequently returns a result, the parent TaskCard remains completed while the nested transcript preserves the Subagent error.",
      "The framework must not synthesize a failed parent TaskCard from SUBAGENT_ERROR.",
    ],
  },
  steps: [
    {
      type: "subagent-tool",
      toolCallId: "error-parent-tool",
      toolName: "delegate_specialist",
      args: { task: "Inspect the failing architecture branch" },
      prepareDurationMs: 300,
      subagent: {
        id: "subagent-error",
        name: "Failing Researcher",
        description: "Produces attributed content before failing",
        steps: [
          {
            type: "message",
            text: "我已经定位到失败分支，接下来无法继续读取 Runtime。",
            intervalMs: 35,
          },
        ],
        outcome: {
          type: "error",
          message: "Researcher failed during runtime inspection",
          code: "SUBAGENT_RESEARCH_FAILED",
        },
      },
      result: { ok: false, reason: "subagent-error" },
    },
  ],
});
