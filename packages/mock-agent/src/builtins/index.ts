import { agentElementsShowcaseScenario } from "./agent-elements-showcase.js";
import { agentPlanScenario } from "./agent-plan.js";
import { agentStatusScenario } from "./agent-status.js";
import { approvalResumeScenario } from "./approval-resume.js";
import { multiToolScenario } from "./multi-tool.js";
import { nestedSubagentConversationScenario } from "./nested-subagent-conversation.js";
import { nestedSubagentErrorScenario } from "./nested-subagent-error.js";
import { nestedSubagentRecursiveScenario } from "./nested-subagent-recursive.js";
import { parallelToolsScenario } from "./parallel-tools.js";
import { reasoningChatScenario } from "./reasoning-chat.js";
import { reasoningLongPreviewScenario } from "./reasoning-long-preview.js";
import { reasoningToolSuccessScenario } from "./reasoning-tool-success.js";
import { simpleChatScenario } from "./simple-chat.js";
import { stepLifecycleScenario } from "./step-lifecycle.js";
import { subagentLifecycleScenario } from "./subagent-lifecycle.js";
import { subagentsOutOfOrderScenario } from "./subagents-out-of-order.js";
import { subagentsScenario } from "./subagents.js";
import { toolErrorScenario } from "./tool-error.js";
import { toolLongRunningScenario } from "./tool-long-running.js";

export {
  agentElementsShowcaseScenario,
  agentPlanScenario,
  agentStatusScenario,
  approvalResumeScenario,
  multiToolScenario,
  nestedSubagentConversationScenario,
  nestedSubagentErrorScenario,
  nestedSubagentRecursiveScenario,
  parallelToolsScenario,
  reasoningChatScenario,
  reasoningLongPreviewScenario,
  reasoningToolSuccessScenario,
  simpleChatScenario,
  stepLifecycleScenario,
  subagentLifecycleScenario,
  subagentsOutOfOrderScenario,
  subagentsScenario,
  toolErrorScenario,
  toolLongRunningScenario,
};

export const builtinMockScenarios = [
  simpleChatScenario,
  reasoningChatScenario,
  reasoningLongPreviewScenario,
  reasoningToolSuccessScenario,
  multiToolScenario,
  toolLongRunningScenario,
  parallelToolsScenario,
  toolErrorScenario,
  stepLifecycleScenario,
  subagentLifecycleScenario,
  approvalResumeScenario,
  agentPlanScenario,
  agentStatusScenario,
  nestedSubagentConversationScenario,
  nestedSubagentErrorScenario,
  nestedSubagentRecursiveScenario,
  subagentsScenario,
  subagentsOutOfOrderScenario,
  agentElementsShowcaseScenario,
];
