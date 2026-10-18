import { useSyncExternalStore } from "react";
/** Host-owned preview inputs. Production always uses the product configuration. */
export interface PreviewAgentEnvironment {
  identity: string;
  runtimeEndpoint: string;
  conversationDataEndpointOverride?: string;
  backendProxyPrefix?: string;
}
declare global { interface Window { __agentUIPreviewEnvironment?: PreviewAgentEnvironment } }
const changed = "agent-ui:preview-environment";
export function getPreviewAgentEnvironment(): PreviewAgentEnvironment | undefined {
  return import.meta.env.DEV ? window.__agentUIPreviewEnvironment : undefined;
}
export function usePreviewAgentEnvironment() {
  return useSyncExternalStore(listener => {
    if (!import.meta.env.DEV) return () => undefined;
    window.addEventListener(changed, listener);
    return () => window.removeEventListener(changed, listener);
  }, getPreviewAgentEnvironment, () => undefined);
}
