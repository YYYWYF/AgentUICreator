import { defineScenario } from "../scenario.js";

/**
 * User-facing AG-UI 0.0.59 Subagent reference:
 *
 * TOOL_CALL_START / TOOL_CALL_ARGS / TOOL_CALL_END (parent)
 * SUBAGENT_STARTED({ subagentRunId, parentToolCallId })
 * REASONING_*, TOOL_CALL_*, and TEXT_MESSAGE_* with subagentRunId
 * SUBAGENT_FINISHED({ subagentRunId })
 * TOOL_CALL_RESULT (parent)
 *
 * Nested output is correlated by subagentRunId; parentToolCallId attaches the
 * subagent run to the spawning parent ToolCall.
 */
const researcherResult = {
  summary: "Conversation Runtime inspection complete",
};

export const nestedSubagentConversationScenario = defineScenario({
  id: "nested-subagent-conversation",
  title: "AG-UI Subagent → Task Card",
  description: "标准 AG-UI Subagent 参考案例：父 ToolCall 启动 Researcher，SUBAGENT_* 事件由 react-ag-ui 投影为 nested messages，最终由 assistant-ui TaskCard 展示。",
  category: "multi-agent",
  capabilities: ["reasoning", "tool", "subagent"],
  reference: {
    protocol: "AG-UI",
    pattern: "Agents as Tools / Nested Subagent",
    presentation: "assistant-ui TaskCard",
    level: "recommended",
    eventFlow: [
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "SUBAGENT_STARTED",
      "Child events tagged with subagentRunId",
      "SUBAGENT_FINISHED",
      "TOOL_CALL_RESULT",
    ],
    notes: [
      "parentToolCallId attaches the subagent run to the spawning tool call.",
      "subagentRunId attributes child reasoning, tool and message events to the subagent.",
      "The UI does not consume SUBAGENT_* directly; react-ag-ui projects them to ToolCallMessagePart.messages.",
    ],
  },
  steps: [
    {
      type: "subagent-tool",
      toolCallId: "invoke-researcher-1",
      toolName: "delegate_specialist",
      args: { task: "Inspect Conversation Runtime", subagent_type: "researcher" },
      prepareDurationMs: 300,
      subagent: {
        id: "researcher-1",
        name: "Architecture Researcher",
        description: "Inspects the Agent UI architecture",
        steps: [
          {
            type: "reasoning",
            text: "我先检查 Conversation Runtime 和 Conversation Adapter。",
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
            text: "检查完成：Conversation Runtime 负责 assistant-ui Runtime 集成，AgentUICreator 通过 facade 和 Plugin seam 提供产品扩展。",
            intervalMs: 25,
          },
        ],
        outcome: { type: "completed", result: researcherResult },
      },
      result: researcherResult,
    },
    {
      type: "message",
      text: "Researcher 已完成 Conversation Runtime 检查，我已经收到它的结果。",
      intervalMs: 35,
    },
  ],
});
