import { defineScenario } from "../scenario.js";

/**
 * User-facing AG-UI 0.0.59 Subagent reference:
 *
 * TOOL_CALL_START / TOOL_CALL_ARGS (parent)
 * SUBAGENT_STARTED({ subagentRunId, parentToolCallId })
 * REASONING_*, TOOL_CALL_*, and TEXT_MESSAGE_* with subagentRunId
 * SUBAGENT_FINISHED({ subagentRunId })
 * TOOL_CALL_RESULT / TOOL_CALL_END (parent)
 *
 * Nested output is correlated by subagentRunId; parentToolCallId attaches the
 * subagent run to the spawning parent ToolCall.
 */
const researcherResult = {
  summary: "Architecture inspection complete",
};

export const nestedSubagentConversationScenario = defineScenario({
  id: "nested-subagent-conversation",
  title: "Nested Subagent Conversation",
  description: "让 Researcher 子 Agent 在父 ToolCall 内展示自己的 reasoning、工具调用和最终结果。",
  category: "agent",
  capabilities: ["reasoning", "tool", "subagent"],
  steps: [
    {
      type: "subagent-tool",
      toolCallId: "invoke-researcher-1",
      toolName: "delegate_specialist",
      args: { task: "Inspect the Agent UI architecture" },
      prepareDurationMs: 300,
      subagent: {
        id: "researcher-1",
        name: "Architecture Researcher",
        description: "Inspects the Agent UI architecture",
        steps: [
          {
            type: "reasoning",
            text: "我先检查 Agent UI 的核心 Runtime 和 conversation adapter。",
            durationMs: 900,
          },
          {
            type: "tool",
            name: "search_files",
            args: { keyword: "conversation runtime" },
            result: {
              files: [
                "packages/runtime-conversation/src/ConversationRuntimeProvider.tsx",
                "examples/agent-frontend/agent-ui/conversation/ConversationAdapter.tsx",
              ],
            },
            prepareDurationMs: 250,
            durationMs: 700,
          },
          {
            type: "message",
            text: "检查完成：当前项目由 Conversation Runtime 负责会话呈现，AgentUICreator 保留产品扩展层。",
            intervalMs: 25,
          },
        ],
        outcome: { type: "completed", result: researcherResult },
      },
      result: researcherResult,
    },
    {
      type: "message",
      text: "Researcher 已完成架构检查，我已经收到它的结果。",
      intervalMs: 35,
    },
  ],
});
