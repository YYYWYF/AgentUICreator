import { AGENT_PROXY, BACKEND_PROXY, type AgentConnectionState, type ResolvedPreviewAgentSource } from "./types.js";
export function resolvePreviewAgentSource(state: AgentConnectionState): ResolvedPreviewAgentSource {
  const scope = state.agentId === undefined ? {} : { agentId: state.agentId };
  if (state.enabled === false) return { type: "application", ...scope };
  if (state.activeSource === "connected" && state.endpoint) return {
    type: "connected", ...scope, identity: JSON.stringify([state.agentId, "connected", state.connectionMode ?? "proxy", state.endpoint]),
    runtimeEndpoint: state.connectionMode === "direct" ? state.endpoint : AGENT_PROXY,
    backendProxyPrefix: state.connectionMode === "direct" ? new URL(state.endpoint).origin : BACKEND_PROXY,
  };
  return { type: "mock", ...scope, identity: state.agentId === undefined ? "mock" : JSON.stringify([state.agentId, "mock"]), runtimeEndpoint: "/__agent-ui/mock", conversationDataEndpointOverride: "/__agent-ui/mock-data" };
}
