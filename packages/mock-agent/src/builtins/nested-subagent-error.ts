import { defineScenario } from "../scenario.js";

export const nestedSubagentErrorScenario = defineScenario({
  id: "nested-subagent-error",
  title: "Nested Subagent Error",
  description: "展示带有归属内容的 SUBAGENT_ERROR nested reference case。",
  category: "agent",
  capabilities: ["tool", "subagent"],
  steps: [
    {
      type: "subagent-tool",
      toolCallId: "error-parent-tool",
      toolName: "delegate_specialist",
      args: { task: "Inspect the failing architecture branch" },
      prepareDurationMs: 0,
      subagent: {
        id: "subagent-error",
        name: "Failing Researcher",
        description: "Produces attributed content before failing",
        steps: [
          {
            type: "message",
            text: "我已经定位到失败分支，接下来无法继续读取 Runtime。",
            intervalMs: 0,
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
