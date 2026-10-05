import { composerMentionScenario } from "./composer-mention.js";
import { composerSlashScenario } from "./composer-slash.js";
import { quoteReplyScenario } from "./quote-reply.js";
import { sourceCitationsScenario } from "./source-citations.js";
import { multimodalInputScenario } from "./multimodal-input.js";
import { fileOutputScenario } from "./file-output.js";
import { a2uiFormControlsScenario } from "./a2ui-form-controls.js";
import { a2uiInteractiveOrderScenario } from "./a2ui-interactive-order.js";
import { frontendToolFillFormScenario } from "./frontend-tool-fill-form.js";
import { askUserQuestionScenario } from "./ask-user-question.js";
import { frontendToolOpenDialogScenario } from "./frontend-tool-open-dialog.js";
import { concurrentConversationsScenario } from "./concurrent-conversations.js";
import { multiMessageResponseScenario } from "./multi-message-response.js";
import { cancelBeforeFirstOutputScenario } from "./cancel-before-first-output.js";
import { agentPlanScenario } from "./agent-plan.js";
import { agentStatusScenario } from "./agent-status.js";
import { dataMessageChartScenario } from "./data-message-chart.js";
import { agentStateSyncScenario } from "./agent-state-sync.js";
import { approvalResumeScenario } from "./approval-resume.js";
import { multiToolScenario } from "./multi-tool.js";
import { nestedSubagentConversationScenario } from "./nested-subagent-conversation.js";
import { nestedSubagentErrorScenario } from "./nested-subagent-error.js";
import { nestedSubagentRecursiveScenario } from "./nested-subagent-recursive.js";
import { nestedSubagentTaskGroupScenario } from "./nested-subagent-task-group.js";
import { parallelToolsScenario } from "./parallel-tools.js";
import { reasoningChatScenario } from "./reasoning-chat.js";
import { reasoningLongPreviewScenario } from "./reasoning-long-preview.js";
import { reasoningToolSuccessScenario } from "./reasoning-tool-success.js";
import { simpleChatScenario } from "./simple-chat.js";
import { resumableAgentPlanScenario } from "./resumable-agent-plan.js";
import { resumableLongRunScenario } from "./resumable-long-run.js";
import { markdownShowcaseScenario } from "./markdown-showcase.js";
import { subagentLifecycleScenario } from "./subagent-lifecycle.js";
import { toolErrorScenario } from "./tool-error.js";
import { toolLongRunningScenario } from "./tool-long-running.js";
import type { MockScenario } from "../scenario.js";

export {
  composerMentionScenario,
  composerSlashScenario,
  quoteReplyScenario,
  sourceCitationsScenario,
  cancelBeforeFirstOutputScenario,
  fileOutputScenario,
  multimodalInputScenario,
  a2uiFormControlsScenario,
  a2uiInteractiveOrderScenario,
  frontendToolOpenDialogScenario,
  frontendToolFillFormScenario,
  askUserQuestionScenario,
  concurrentConversationsScenario,
  multiMessageResponseScenario,
  agentPlanScenario,
  agentStatusScenario,
  dataMessageChartScenario,
  agentStateSyncScenario,
  approvalResumeScenario,
  multiToolScenario,
  nestedSubagentConversationScenario,
  nestedSubagentErrorScenario,
  nestedSubagentRecursiveScenario,
  nestedSubagentTaskGroupScenario,
  parallelToolsScenario,
  reasoningChatScenario,
  reasoningLongPreviewScenario,
  reasoningToolSuccessScenario,
  simpleChatScenario,
  resumableAgentPlanScenario,
  resumableLongRunScenario,
  markdownShowcaseScenario,
  subagentLifecycleScenario,
  toolErrorScenario,
  toolLongRunningScenario,
};

export const backendReferenceMockScenarios: MockScenario[] = [
  sourceCitationsScenario,
  multimodalInputScenario,
  concurrentConversationsScenario,
  simpleChatScenario,
  markdownShowcaseScenario,
  reasoningChatScenario,
  reasoningToolSuccessScenario,
  parallelToolsScenario,
  toolErrorScenario,
  approvalResumeScenario,
  agentStateSyncScenario,
  nestedSubagentConversationScenario,
];

export const frontendPresentationMockScenarios: MockScenario[] = [
  composerMentionScenario,
  composerSlashScenario,
  quoteReplyScenario,
  resumableLongRunScenario,
  resumableAgentPlanScenario,
  cancelBeforeFirstOutputScenario,
  fileOutputScenario,
  a2uiFormControlsScenario,
  a2uiInteractiveOrderScenario,
  frontendToolOpenDialogScenario,
  frontendToolFillFormScenario,
  askUserQuestionScenario,
  multiMessageResponseScenario,
  dataMessageChartScenario,
  nestedSubagentTaskGroupScenario,
  agentPlanScenario,
  agentStatusScenario,
  nestedSubagentRecursiveScenario,
  nestedSubagentErrorScenario,
];

export const showcaseMockScenarios: MockScenario[] = [
  ...backendReferenceMockScenarios,
  ...frontendPresentationMockScenarios,
];

export const mockRegressionScenarios: MockScenario[] = [
  reasoningLongPreviewScenario,
  multiToolScenario,
  toolLongRunningScenario,
  subagentLifecycleScenario,
];

export const builtinMockScenarios: MockScenario[] = [
  ...showcaseMockScenarios,
  ...mockRegressionScenarios,
];
