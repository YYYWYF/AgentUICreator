import type { AgentFrontendToolSource } from "@za38.03/agent-ui-core";
export interface ConversationFrontendToolPort {
  source: AgentFrontendToolSource;
  integrationPoint: "ConversationRuntime.frontendTools";
  status: "active";
}
export function createConversationFrontendToolPort(source: AgentFrontendToolSource): ConversationFrontendToolPort {
  return { source, integrationPoint: "ConversationRuntime.frontendTools", status: "active" };
}
