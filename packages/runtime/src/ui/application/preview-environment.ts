import { useSyncExternalStore } from "react";
/** Host-owned preview inputs. Production always uses the product configuration. */
export interface PreviewAgentEnvironment {
  identity: string;
  runtimeEndpoint: string;
  conversationDataEndpointOverride?: string;
  backendProxyPrefix?: string;
}
declare global { interface Window { __agentUIPreviewEnvironment?: PreviewAgentEnvironment; __agentUIPreviewEnvironmentReady?: boolean } }
const changed = "agent-ui:preview-environment";
export function getPreviewAgentEnvironment(development = false): PreviewAgentEnvironment | undefined {
  return development ? window.__agentUIPreviewEnvironment : undefined;
}
export function usePreviewAgentEnvironment(development = false) {
  return useSyncExternalStore(listener => {
    if (!development) return () => undefined;
    window.addEventListener(changed, listener);
    return () => window.removeEventListener(changed, listener);
  // null means the Creator handshake completed with the application connection.
  // Keep it distinct from undefined so an initially disabled iframe can render.
  }, () => getPreviewAgentEnvironment(development) ?? (development && window.__agentUIPreviewEnvironmentReady ? null : undefined), () => undefined);
}
