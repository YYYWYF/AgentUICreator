import type { RuntimeCompositionReporter, RuntimeDiagnosticReporter, RuntimeDiagnostic, RuntimeCompositionSnapshot } from "../runtime/diagnostics";

/** Generic Host seam. No development-tool transport belongs in the Agent. */
export interface AgentObservability {
  onRuntimeDiagnostic?: RuntimeDiagnosticReporter;
  onRuntimeComposition?: RuntimeCompositionReporter;
  onPreviewCommitted?: (appUIModelHash: string, root: HTMLElement) => void;
}
export type AgentUIObservation =
  | { type: "runtime-diagnostic"; diagnostic: RuntimeDiagnostic }
  | { type: "runtime-composition"; composition: RuntimeCompositionSnapshot }
  | { type: "preview-committed"; appUIModelHash: string; root: HTMLElement };

/** Dev adapters can attach after the Host has rendered, including after reload. */
export const AGENT_UI_OBSERVATION_EVENT = "agent-ui:observation";
const REQUEST_EVENT = "agent-ui:observation-request";
const CACHE_KEY = Symbol.for("agent-ui.dev.observations");
function observationCache(): Map<string, AgentUIObservation> {
  const host = window as unknown as Record<symbol, Map<string, AgentUIObservation> | undefined>;
  return host[CACHE_KEY] ??= new Map();
}
export function publishAgentUIObservation(detail: AgentUIObservation): void {
  if (!import.meta.env.DEV) return;
  const cache = observationCache();
  const key = detail.type === "runtime-diagnostic"
    ? `${detail.type}:${detail.diagnostic.appUIModelHash}:${detail.diagnostic.kind}:${detail.diagnostic.instanceId}:${detail.diagnostic.eventName}`
    : detail.type;
  cache.delete(key);
  cache.set(key, detail);
  if (cache.size > 130) {
    const oldestDiagnostic = [...cache.keys()].find(key => key.startsWith("runtime-diagnostic:"));
    if (oldestDiagnostic !== undefined) cache.delete(oldestDiagnostic);
  }
  window.dispatchEvent(new CustomEvent(AGENT_UI_OBSERVATION_EVENT, { detail }));
}
if (import.meta.env.DEV) {
  const replay = () => {
    for (const detail of observationCache().values()) {
      if (detail.type === "preview-committed" && !detail.root.isConnected) continue;
      window.dispatchEvent(new CustomEvent(AGENT_UI_OBSERVATION_EVENT, { detail }));
    }
  };
  window.addEventListener(REQUEST_EVENT, replay);
  import.meta.hot?.dispose(() => window.removeEventListener(REQUEST_EVENT, replay));
}
