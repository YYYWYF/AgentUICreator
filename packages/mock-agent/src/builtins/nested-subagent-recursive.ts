import { defineScenario } from "../scenario.js";

const deepResearchResult = {
  summary: "Deep runtime inspection complete",
};

const researcherResult = {
  summary: "Recursive architecture inspection complete",
};

export const nestedSubagentRecursiveScenario = defineScenario({
  id: "nested-subagent-recursive",
  title: "Recursive Nested Subagents",
  description: "让两级 Researcher 子 Agent 通过标准 AG-UI attribution 递归展示。",
  category: "agent",
  capabilities: ["reasoning", "tool", "subagent"],
  steps: [
    {
      type: "subagent-tool",
      toolCallId: "parent-tool",
      toolName: "delegate_specialist",
      args: { task: "Inspect the Agent UI architecture recursively" },
      prepareDurationMs: 0,
      subagent: {
        id: "subagent-a",
        name: "Architecture Researcher",
        description: "Delegates a deeper runtime inspection",
        steps: [
          {
            type: "reasoning",
            text: "我先把 Runtime 细节交给更深一层的 Specialist。",
            durationMs: 0,
          },
          {
            type: "subagent-tool",
            toolCallId: "child-tool",
            toolName: "delegate_specialist",
            args: { task: "Inspect the Conversation Runtime" },
            prepareDurationMs: 0,
            subagent: {
              id: "subagent-b",
              name: "Runtime Specialist",
              description: "Inspects the Conversation Runtime",
              steps: [
                {
                  type: "reasoning",
                  text: "我检查 Conversation Runtime 的事件归属。",
                  durationMs: 0,
                },
                {
                  type: "tool",
                  name: "read_runtime",
                  args: { file: "ConversationRuntimeProvider.tsx" },
                  result: { status: "read" },
                  prepareDurationMs: 0,
                  durationMs: 0,
                },
                {
                  type: "message",
                  text: "Subagent B 已完成 Runtime 检查。",
                  intervalMs: 0,
                },
              ],
              outcome: { type: "completed", result: deepResearchResult },
            },
            result: deepResearchResult,
          },
          {
            type: "message",
            text: "Subagent A 已收到更深层 Specialist 的结果。",
            intervalMs: 0,
          },
        ],
        outcome: { type: "completed", result: researcherResult },
      },
      result: researcherResult,
    },
    {
      type: "message",
      text: "递归 Subagent 检查已完成。",
      intervalMs: 0,
    },
  ],
});
