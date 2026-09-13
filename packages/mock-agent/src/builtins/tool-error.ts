import { defineScenario } from "../scenario.js";

export const toolErrorScenario = defineScenario({
  id: "tool-error",
  title: "Tool Error",
  description: "通过标准 RUN_ERROR 暴露未完成工具调用。",
  category: "tool",
  capabilities: ["tool", "tool-error"],
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
