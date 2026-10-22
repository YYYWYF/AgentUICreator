import { defineScenario } from "../scenario.js";

const deepResearchResult = {
  summary: "深层 Runtime 检查完成",
};

const researcherResult = {
  summary: "递归架构检查完成",
};

export const nestedSubagentRecursiveScenario = defineScenario({
  id: "nested-subagent-recursive",
  resources: ["reasoning", "tool-group", "tool-approval", "task-group"],
  title: "Recursive AG-UI Subagents",
  description: "通过标准 AG-UI attribution 展示 Subagent A 委托 child Tool 并递归生成 Subagent B 的 nested TaskCard。",
  category: "advanced",
  capabilities: ["reasoning", "tool", "subagent"],
  reference: {
    audience: "frontend",
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
      args: { task: "递归检查 Agent UI 架构" },
      prepareDurationMs: 300,
      subagent: {
        id: "subagent-a",
        name: "架构研究员",
        description: "委托更深入地检查 Runtime",
        steps: [
          {
            type: "reasoning",
            text: "我先把 Runtime 细节交给更深入的专家检查。",
            durationMs: 800,
          },
          {
            type: "subagent-tool",
            toolCallId: "child-tool",
            toolName: "delegate_specialist",
            args: { task: "检查 Conversation Runtime" },
            prepareDurationMs: 300,
            subagent: {
              id: "subagent-b",
              name: "Runtime 专家",
              description: "检查 Conversation Runtime",
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
                  text: "子 Agent B 已完成 Runtime 检查。",
                  intervalMs: 30,
                },
              ],
              outcome: { type: "completed", result: deepResearchResult },
            },
            result: deepResearchResult,
          },
          {
            type: "message",
            text: "子 Agent A 已收到更深层专家的结果。",
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
