import { defineScenario } from "../scenario.js";

const deepResearchResult = {
  summary: "Deep runtime inspection complete",
};

const researcherResult = {
  summary: "Recursive architecture inspection complete",
};

export const nestedSubagentRecursiveScenario = defineScenario({
  id: "nested-subagent-recursive",
  title: "Recursive AG-UI Subagents",
  description: "通过标准 AG-UI attribution 展示 Subagent A 委托 child Tool 并递归生成 Subagent B 的 nested TaskCard。",
  category: "advanced",
  capabilities: ["reasoning", "tool", "subagent"],
  reference: {
    protocol: "AG-UI",
    pattern: "Subagent A → child Tool → Subagent B",
    presentation: "Nested TaskCard",
    level: "advanced",
    eventFlow: [
      "SUBAGENT_STARTED (Subagent A)",
      "Child TOOL_CALL tagged with subagentRunId",
      "SUBAGENT_STARTED (Subagent B)",
      "Nested child events tagged with subagentRunId",
      "SUBAGENT_FINISHED (Subagent B)",
      "SUBAGENT_FINISHED (Subagent A)",
    ],
    notes: [
      "Subagent B uses parentSubagentRunId = subagent-a.",
      "Subagent B uses parentToolCallId = child-tool.",
      "The recursive presentation is composed by official nested TaskCards.",
    ],
  },
  steps: [
    {
      type: "subagent-tool",
      toolCallId: "parent-tool",
      toolName: "delegate_specialist",
      args: { task: "Inspect the Agent UI architecture recursively" },
      prepareDurationMs: 300,
      subagent: {
        id: "subagent-a",
        name: "Architecture Researcher",
        description: "Delegates a deeper runtime inspection",
        steps: [
          {
            type: "reasoning",
            text: "我先把 Runtime 细节交给更深一层的 Specialist。",
            durationMs: 800,
          },
          {
            type: "subagent-tool",
            toolCallId: "child-tool",
            toolName: "delegate_specialist",
            args: { task: "Inspect the Conversation Runtime" },
            prepareDurationMs: 300,
            subagent: {
              id: "subagent-b",
              name: "Runtime Specialist",
              description: "Inspects the Conversation Runtime",
              steps: [
                {
                  type: "reasoning",
                  text: "我检查 Conversation Runtime 的事件归属。",
                  durationMs: 900,
                },
                {
                  type: "tool",
                  name: "read_runtime",
                  args: { file: "ConversationRuntimeProvider.tsx" },
                  result: { status: "read" },
                  prepareDurationMs: 300,
                  durationMs: 800,
                },
                {
                  type: "message",
                  text: "Subagent B 已完成 Runtime 检查。",
                  intervalMs: 30,
                },
              ],
              outcome: { type: "completed", result: deepResearchResult },
            },
            result: deepResearchResult,
          },
          {
            type: "message",
            text: "Subagent A 已收到更深层 Specialist 的结果。",
            intervalMs: 30,
          },
        ],
        outcome: { type: "completed", result: researcherResult },
      },
      result: researcherResult,
    },
    {
      type: "message",
      text: "递归 Subagent 检查已完成。",
      intervalMs: 30,
    },
  ],
});
