export const CONNECTION_API = "/__agent-ui/creator/connection";
export const AGENT_PROXY = "/__agent-ui/agent-proxy/run";
export const BACKEND_PROXY = "/__agent-ui/backend";
export type PreviewAgentSource = { type: "mock" } | { type: "connected"; endpoint: string };
export interface AgentConnectionState {
  activeSource: "mock" | "connected";
  endpoint?: string;
  configured: boolean;
  running: boolean;
}
export interface ResolvedPreviewAgentSource {
  type: "mock" | "connected";
  identity: string;
  runtimeEndpoint: string;
  conversationDataEndpointOverride?: string;
  backendProxyPrefix?: string;
}
