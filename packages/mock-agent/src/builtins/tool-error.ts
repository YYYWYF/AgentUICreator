import { defineScenario } from "../scenario.js";

export const toolErrorScenario = defineScenario({
  id: "tool-error",
  title: "Run Error During Tool",
  description: "Tool call 已建立但尚未产生结果时，Agent Run 通过标准 RUN_ERROR 失败。",
  category: "tools",
  capabilities: ["tool", "run-error"],
  reference: {
    audience: "backend",
    protocol: "AG-UI",
    pattern: "Tool Call → RUN_ERROR",
    presentation: "assistant-ui ToolCall error",
    eventFlow: ["TOOL_CALL_START/ARGS/END", "RUN_ERROR"],
    notes: ["RUN_ERROR is run-scoped and never carries subagentRunId."],
  },
  steps: [
    {
      type: "tool",
      name: "inspect_unavailable_service",
      args: { service: "workspace-index" },
      result: null,
      prepareDurationMs: 300,
      durationMs: 900,
      error: {
        type: "error",
        message: "workspace-index is unavailable",
        code: "MOCK_SERVICE_UNAVAILABLE",
      },
    },
  ],
});
