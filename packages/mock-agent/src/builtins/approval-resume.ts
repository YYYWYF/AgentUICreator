import { defineScenario } from "../scenario.js";

const approvalToolCallId = "approval-dangerous-tool";

export const approvalResumeScenario = defineScenario({
  id: "approval-resume",
  title: "AG-UI Tool Approval",
  description: "Human in the Loop · Allow / Deny → Resume",
  category: "human-in-loop",
  capabilities: ["reasoning", "tool", "approval"],
  steps: [
    {
      type: "reasoning",
      text: "这个操作会修改工作区，我先请求你的确认。",
      durationMs: 500,
    },
    {
      type: "interrupt",
      toolCallId: approvalToolCallId,
      toolName: "delete_generated_artifacts",
      args: {
        paths: ["dist/", ".cache/"],
        reason: "清理本次生成的临时构建产物",
      },
      interrupt: {
        id: "approval-resume-1",
        reason: "tool_call",
        message: "允许删除生成的临时构建产物吗？",
        toolCallId: approvalToolCallId,
        responseSchema: {
          type: "object",
          properties: { approved: { type: "boolean" } },
          required: ["approved"],
        },
      },
    },
  ],
  resumeSteps: {
    approved: [
      {
        type: "tool-result",
        toolCallId: approvalToolCallId,
        result: { deleted: ["dist/", ".cache/"] },
        durationMs: 500,
      },
      { type: "message", text: "已获得许可，临时构建产物已清理。", intervalMs: 35 },
    ],
    denied: [
      {
        type: "tool-result",
        toolCallId: approvalToolCallId,
        result: { skipped: true, reason: "denied by user" },
        durationMs: 500,
      },
      { type: "message", text: "操作已取消，未删除任何文件。", intervalMs: 35 },
    ],
    cancelled: [
      { type: "message", text: "确认已取消，未删除任何文件。", intervalMs: 35 },
    ],
  },
});
