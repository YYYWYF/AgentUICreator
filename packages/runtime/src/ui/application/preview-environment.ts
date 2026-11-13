import { useSyncExternalStore } from "react";
import { useAgentUIAgentIdentity } from "../../host/AgentUIAgentsProvider.js";
/** Host-owned preview inputs. Production always uses the product configuration. */
export interface PreviewAgentEnvironment {
  agentId?: string | undefined;
  identity: string;
  runtimeEndpoint: string;
  conversationDataEndpointOverride?: string;
  backendProxyPrefix?: string;
}
declare global { interface Window { __agentUIPreviewEnvironment?: PreviewAgentEnvironment; __agentUIPreviewEnvironmentReady?: boolean } }
const changed = "agent-ui:preview-environment";
export function getPreviewAgentEnvironment(development = false, agentId?: string): PreviewAgentEnvironment | undefined {
  if (!development || typeof window === "undefined") return undefined;
  const environment = window.__agentUIPreviewEnvironment;
  return environment?.agentId === agentId ? environment : undefined;
}
export function usePreviewAgentEnvironment(development = false) {
  const agentId = useAgentUIAgentIdentity()?.agentId;
  return useSyncExternalStore(listener => {
    if (!development) return () => undefined;
    window.addEventListener(changed, listener);
    return () => window.removeEventListener(changed, listener);
  // null means the Creator handshake completed with the application connection.
  // Keep it distinct from undefined so an initially disabled iframe can render.
  }, () => getPreviewAgentEnvironment(development, agentId) ??
    (development && (window.__agentUIPreviewEnvironmentReady || window.__agentUIPreviewEnvironment) ? null : undefined), () => undefined);
}
