import type { AgentFrontendToolSource } from "@agent-ui/runtime-core";

/**
 * Formal input port for the existing AgentUICreator frontend-tool policy.
 * The conversation runtime records the integration point without duplicating
 * transport execution. Dynamic execution parity is deferred to P3R-4.
 */
export interface ConversationFrontendToolPort {
  source: AgentFrontendToolSource;
  integrationPoint: "ConversationRuntime.frontendTools";
  status: "deferred";
}

export function createConversationFrontendToolPort(
  source: AgentFrontendToolSource,
): ConversationFrontendToolPort {
  return {
    source,
    integrationPoint: "ConversationRuntime.frontendTools",
    status: "deferred",
  };
}
