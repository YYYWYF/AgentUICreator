export const MOCK_DATA = "/__agent-ui/mock-data";
export const CONNECTION_API = "/__agent-ui/creator/connection";
export const AGENT_PROXY = "/__agent-ui/agent-proxy/run";
export const BACKEND_PROXY = "/__agent-ui/backend";
export type PreviewAgentSource = { type: "mock" } | { type: "connected"; endpoint: string };
export type AgentConnectionMode = "direct" | "proxy";
export interface AgentConnectionState {
  agentId?: string | undefined;
  activeSource: "mock" | "connected";
  enabled?: boolean;
  endpoint?: string;
  connectionMode?: AgentConnectionMode;
  configured: boolean;
  running: boolean;
}
export type ResolvedPreviewAgentSource = { type: "application"; agentId?: string | undefined } | ResolvedActivePreviewAgentSource;
export interface ResolvedActivePreviewAgentSource {
  agentId?: string | undefined;
  type: "mock" | "connected";
  identity: string;
  runtimeEndpoint: string;
  conversationDataEndpointOverride?: string;
  backendProxyPrefix?: string;
}
