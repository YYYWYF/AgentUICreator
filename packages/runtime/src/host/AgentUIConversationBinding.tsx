import { useAuiState } from "@assistant-ui/react";
import { useLayoutEffect, useRef } from "react";
import { useConversationRuntimeBridge } from "../ConversationRuntimeBridgeContext.js";
import { AgentUIConnectionState, useAgentUIRuntimeConnection } from "./AgentUIProvider.js";

/** Keep upstream readiness details inside the runtime package. */
export function AgentUIConversationBinding() {
  const { agentRuntime } = useConversationRuntimeBridge();
  const loading = useAuiState(state => state.thread.isLoading);
  const disabled = useAuiState(state => state.thread.isDisabled);
  // Readiness detaches Host observation, while a background thread keeps its
  // transport. Only retiring this application binding cancels the active run.
  useAgentUIRuntimeConnection(loading || disabled ? undefined : agentRuntime);
  const active = useRef(agentRuntime);
  active.current = agentRuntime;
  useLayoutEffect(() => () => active.current.abort(), []);
  if (loading || disabled) return <AgentUIConnectionState status={loading ? "initializing" : "blocked"} />;
  return null;
}
