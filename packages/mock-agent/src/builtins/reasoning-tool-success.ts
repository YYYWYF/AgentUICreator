import { defineScenario } from "../scenario.js";

export const reasoningToolSuccessScenario = defineScenario({
  id: "reasoning-tool-success",
  title: "Reasoning → Tool → Answer",
  description: "模拟一次思考、工具调用、再次思考和最终回复。",
  category: "basics",
  capabilities: ["reasoning", "tool"],
  reference: {
    protocol: "AG-UI",
    pattern: "Reasoning → Tool → Reasoning → Answer",
    presentation: "assistant-ui Reasoning + ToolCall + Message",
    level: "recommended",
    eventFlow: [
      "REASONING_*",
      "TOOL_CALL_START/ARGS/END",
      "TOOL_CALL_RESULT",
      "REASONING_*",
      "TEXT_MESSAGE_*",
    ],
    notes: [
      "This is the default Mock Scenario because it demonstrates the smallest useful Agent run beyond plain text.",
      "The ToolCall lifecycle remains separate from reasoning and the final assistant message.",
    ],
  },
  steps: [
    {
      type: "reasoning",
      text: "我先检查当前项目中和 AG-UI 相关的实现。",
      durationMs: 1200,
    },
    {
      type: "tool",
      name: "search_files",
      args: { keyword: "AG-UI" },
      result: {
        files: [
          "packages/runtime-conversation/src/ConversationRuntimeProvider.tsx",
          "packages/runtime-conversation/src/compatibility/conversation-execution-projector.ts",
        ],
      },
      prepareDurationMs: 600,
      durationMs: 1800,
    },
    {
      type: "reasoning",
      text: "已经找到相关代码，我整理一下结果。",
      durationMs: 800,
    },
    {
      type: "message",
      text: "检查完成，我找到了 AG-UI Transport 和生命周期投影相关实现。",
      intervalMs: 40,
    },
  ],
});
