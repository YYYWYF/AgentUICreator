import type { AgentFrontendToolSource } from "@za38.03/agent-ui-core";
import type { ConversationToolCallComponent } from "@za38.03/agent-ui-plugins";

/** Application-owned presentation only; entries cannot grant execution permission. */
export interface ConversationFrontendToolUIEntry {
  display?: "inline" | "standalone";
  render: ConversationToolCallComponent;
}
export type ConversationFrontendToolUIRegistry = Readonly<Record<string, ConversationFrontendToolUIEntry>>;

export interface ConversationFrontendToolPort {
  source: AgentFrontendToolSource;
  integrationPoint: "ConversationRuntime.frontendTools";
  status: "active";
}
export function createConversationFrontendToolPort(source: AgentFrontendToolSource): ConversationFrontendToolPort {
  return { source, integrationPoint: "ConversationRuntime.frontendTools", status: "active" };
}
