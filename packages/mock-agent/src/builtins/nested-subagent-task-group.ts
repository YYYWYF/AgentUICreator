import { defineScenario } from "../scenario.js";

/**
 * Three sibling nested Subagents intentionally run sequentially here. The
 * fixture demonstrates assistant-ui TaskGroup grouping without introducing a
 * second mock runner or a parallel SUBAGENT_* scheduling path.
 */
export const nestedSubagentTaskGroupScenario = defineScenario({
  id: "nested-subagent-task-group",
  title: "AG-UI Subagent Task Group",
  description: "多个 sibling nested Subagent 通过标准 AG-UI 事件自然组成 official TaskGroup。",
  category: "multi-agent",
  capabilities: ["tool", "subagent"],
  reference: {
    protocol: "AG-UI",
    pattern: "Sibling nested Subagents / Task Group",
    presentation: "assistant-ui TaskGroup",
    level: "advanced",
    eventFlow: [
      "Parent TOOL_CALL_* + SUBAGENT_STARTED",
      "Sibling child events tagged with subagentRunId",
      "SUBAGENT_FINISHED",
      "Parent TOOL_CALL_RESULT",
    ],
    notes: [
      "Each sibling keeps its own parentToolCallId and subagentRunId relation.",
      "The runner executes siblings sequentially; grouping is the presentation contract.",
      "assistant-ui TaskGroup groups sibling parent tools without custom Subagent UI.",
    ],
  },
  steps: [
    {
      type: "subagent-tool",
      toolCallId: "architecture-tool",
      toolName: "delegate_specialist",
      args: { task: "Inspect Architecture", subagent_type: "researcher" },
      prepareDurationMs: 0,
      subagent: {
        id: "architecture-agent",
        name: "Architecture Researcher",
        description: "Inspects the Agent UI architecture",
        steps: [
          {
            type: "message",
            text: "架构检查完成。",
            intervalMs: 0,
          },
        ],
        outcome: {
          type: "completed",
          result: { summary: "Architecture inspection complete" },
        },
      },
      result: { summary: "Architecture inspection complete" },
    },
    {
      type: "subagent-tool",
      toolCallId: "runtime-tool",
      toolName: "delegate_specialist",
      args: { task: "Inspect Conversation Runtime", subagent_type: "runtime" },
      prepareDurationMs: 0,
      subagent: {
        id: "runtime-agent",
        name: "Runtime Inspector",
        description: "Inspects the Conversation Runtime",
        steps: [
          {
            type: "message",
            text: "Conversation Runtime 检查完成。",
            intervalMs: 0,
          },
        ],
        outcome: {
          type: "completed",
          result: { summary: "Conversation Runtime inspection complete" },
        },
      },
      result: { summary: "Conversation Runtime inspection complete" },
    },
    {
      type: "subagent-tool",
      toolCallId: "ui-tool",
      toolName: "delegate_specialist",
      args: { task: "Review Conversation UI", subagent_type: "reviewer" },
      prepareDurationMs: 0,
      subagent: {
        id: "ui-agent",
        name: "UI Reviewer",
        description: "Reviews the Conversation UI",
        steps: [
          {
            type: "message",
            text: "Conversation UI review complete.",
            intervalMs: 0,
          },
        ],
        outcome: {
          type: "completed",
          result: { summary: "Conversation UI review complete" },
        },
      },
      result: { summary: "Conversation UI review complete" },
    },
  ],
});
