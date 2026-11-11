import { defineScenario } from "../scenario.js";

const approvalToolCallId = "approval-leave-policy";
const toolName = "confirm_take_leave_policy";
const args = { user: "杨康", leave_policy: "年假" };
const review = {
  action_requests: [{
    name: toolName,
    args,
    description: "请确认您的请假方案\n\nTool: confirm_take_leave_policy\nArgs: {'user': '杨康', 'leave_policy': '年假'}",
  }],
  review_configs: [{ action_name: toolName, allowed_decisions: ["approve", "edit", "reject", "respond"] }],
};

function createApprovalScenario(legacy: boolean) {
  return defineScenario({
    id: legacy ? "approval-legacy" : "approval-resume",
    resources: ["reasoning", "tool-group", "tool-approval"],
    title: legacy ? "Tool Approval · Legacy CUSTOM" : "Tool Approval · Modern Interrupt",
    description: legacy
      ? "Legacy format: ON_INTERRUPT carries an object; decisions use forwardedProps.command."
      : "Modern format: RUN_FINISHED carries metadata.langgraph.raw; decisions use resume[].",
    category: "human-in-loop",
    capabilities: ["reasoning", "tool", "approval"],
    reference: {
      audience: "backend",
      protocol: legacy ? "AG-UI CUSTOM compatibility" : "AG-UI 1.0",
      pattern: legacy ? "CUSTOM ON_INTERRUPT → Command" : "Interrupt → Resume",
      presentation: "Tool approval",
      eventFlow: [
        "TOOL_CALL_START/ARGS/END",
        legacy ? "CUSTOM ON_INTERRUPT (object)" : "RUN_FINISHED(outcome: interrupt, metadata.langgraph.raw)",
        "TOOL_CALL_RESULT (after approval)",
      ],
      notes: [
        "Both formats use the default tool-result approval UI; edit and respond are hidden.",
        "The modern format intentionally omits toolCallId; the Runtime matches the tool name and arguments.",
        "If both formats arrive in one run, the native interrupt owns continuation and the UI shows one approval.",
      ],
    },
    steps: [
      { type: "reasoning", text: "请假方案已经准备好，我先请你确认。", durationMs: 500 },
      {
        type: "interrupt",
        format: legacy ? "custom" : "outcome",
        toolCallId: approvalToolCallId,
        toolName,
        args,
        interrupt: {
          id: "approval-resume-1",
          reason: "langgraph:interrupt",
          metadata: { langgraph: { raw: review, ns: null, resumable: null, when: null } },
        },
      },
    ],
    resumeSteps: {
      approved: [
        { type: "tool-result", toolCallId: approvalToolCallId, result: { confirmed: true, ...args }, durationMs: 500 },
        { type: "message", text: "已确认这次请假方案，继续处理后续流程。", intervalMs: 35 },
      ],
      denied: [
        { type: "tool-result", toolCallId: approvalToolCallId, result: { confirmed: false, reason: "用户已拒绝" }, durationMs: 500 },
        { type: "message", text: "已取消这次请假方案，未继续办理。", intervalMs: 35 },
      ],
      cancelled: [{ type: "message", text: "审批已取消，未继续办理。", intervalMs: 35 }],
    },
  });
}

export const approvalLegacyScenario = createApprovalScenario(true);
export const approvalResumeScenario = createApprovalScenario(false);
