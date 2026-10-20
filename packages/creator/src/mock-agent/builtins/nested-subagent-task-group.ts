import { defineScenario } from "../scenario.js";

/**
 * Three sibling nested Subagents intentionally run sequentially here. The
 * fixture demonstrates Agent UI TaskGroup grouping without introducing a
 * second mock runner or a parallel SUBAGENT_* scheduling path.
 */
export const nestedSubagentTaskGroupScenario = defineScenario({
  id: "nested-subagent-task-group",
  resources: ["reasoning", "tool-group", "tool-approval", "task-group"],
  title: "AG-UI Subagent Task Group",
  description: "多个 sibling nested Subagent 通过标准 AG-UI 事件自然组成 official TaskGroup。",
  category: "multi-agent",
  capabilities: ["tool", "subagent"],
  reference: {
    audience: "frontend",
    protocol: "AG-UI",
    pattern: "Sibling nested Subagents / Task Group",
    presentation: "Agent UI TaskGroup",
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
      "Agent UI TaskGroup groups sibling parent tools without custom Subagent UI.",
    ],
  },
  steps: [
    {
      type: "subagent-tool",
      toolCallId: "architecture-tool",
      toolName: "delegate_specialist",
      args: { task: "检查架构", subagent_type: "researcher" },
      prepareDurationMs: 250,
      subagent: {
        id: "architecture-agent",
        name: "架构研究员",
        description: "检查 Agent UI 架构",
        steps: [
          {
            type: "reasoning",
            text: "正在检查 Agent UI 架构和组合边界。",
            durationMs: 700,
          },
          {
            type: "message",
            text: "架构检查完成。",
            intervalMs: 25,
          },
        ],
        outcome: {
          type: "completed",
          result: { summary: "架构检查完成" },
        },
      },
      result: { summary: "架构检查完成" },
    },
    {
      type: "subagent-tool",
      toolCallId: "runtime-tool",
      toolName: "delegate_specialist",
      args: { task: "检查 Conversation Runtime", subagent_type: "runtime" },
      prepareDurationMs: 250,
      subagent: {
        id: "runtime-agent",
        name: "Runtime 检查员",
        description: "检查 Conversation Runtime",
        steps: [
          {
            type: "reasoning",
            text: "正在检查 Conversation Runtime 和 Adapter 边界。",
            durationMs: 700,
          },
          {
            type: "message",
            text: "Conversation Runtime 检查完成。",
            intervalMs: 25,
          },
        ],
        outcome: {
          type: "completed",
          result: { summary: "Conversation Runtime 检查完成" },
        },
      },
      result: { summary: "Conversation Runtime 检查完成" },
    },
    {
      type: "subagent-tool",
      toolCallId: "ui-tool",
      toolName: "delegate_specialist",
      args: { task: "评审 Conversation UI", subagent_type: "reviewer" },
      prepareDurationMs: 250,
      subagent: {
        id: "ui-agent",
        name: "UI 评审员",
        description: "评审 Conversation UI",
        steps: [
          {
            type: "reasoning",
            text: "正在评审 Conversation UI 和 TaskGroup 展示。",
            durationMs: 700,
          },
          {
            type: "message",
            text: "Conversation UI 评审完成。",
            intervalMs: 25,
          },
        ],
        outcome: {
          type: "completed",
          result: { summary: "Conversation UI 评审完成" },
        },
      },
      result: { summary: "Conversation UI 评审完成" },
    },
  ],
});
