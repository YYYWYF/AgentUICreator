import { useAuiState } from "@assistant-ui/react";
import { useConversationRuntimeBridge } from "../ConversationRuntimeBridgeContext.js";
import { AgentUIConnectionState, AgentUIRuntimeBinding } from "./AgentUIProvider.js";

/** Keep upstream readiness details inside the runtime package. */
export function AgentUIConversationBinding() {
  const { agentRuntime } = useConversationRuntimeBridge();
  const loading = useAuiState(state => state.thread.isLoading);
  const disabled = useAuiState(state => state.thread.isDisabled);
  if (loading || disabled) return <AgentUIConnectionState status={loading ? "initializing" : "blocked"} />;
  return <AgentUIRuntimeBinding runtime={agentRuntime} />;
}
