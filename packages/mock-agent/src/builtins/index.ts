import { multiMessageResponseScenario } from "./multi-message-response.js";
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
import { subagentLifecycleScenario } from "./subagent-lifecycle.js";
import { toolErrorScenario } from "./tool-error.js";
import { toolLongRunningScenario } from "./tool-long-running.js";
import type { MockScenario } from "../scenario.js";

export {
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
  subagentLifecycleScenario,
  toolErrorScenario,
  toolLongRunningScenario,
};

export const backendReferenceMockScenarios: MockScenario[] = [
  simpleChatScenario,
  reasoningChatScenario,
  reasoningToolSuccessScenario,
  parallelToolsScenario,
  toolErrorScenario,
  approvalResumeScenario,
  agentStateSyncScenario,
  nestedSubagentConversationScenario,
];

export const frontendPresentationMockScenarios: MockScenario[] = [
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
