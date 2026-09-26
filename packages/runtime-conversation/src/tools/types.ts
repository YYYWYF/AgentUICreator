import type { AgentFrontendToolSource } from "@agent-ui/runtime-core";
import type { ConversationToolCallComponent } from "@agent-ui/react";

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
