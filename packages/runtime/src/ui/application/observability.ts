import type { RuntimeCompositionReporter, RuntimeDiagnosticReporter, RuntimeDiagnostic, RuntimeCompositionSnapshot } from "../runtime/diagnostics/index.js";

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
export type ScopedAgentUIObservation = AgentUIObservation & { agentId?: string };

/** Dev adapters can attach after the Host has rendered, including after reload. */
export const AGENT_UI_OBSERVATION_EVENT = "agent-ui:observation";
const REQUEST_EVENT = "agent-ui:observation-request";
const CACHE_KEY = Symbol.for("agent-ui.dev.observations");
function observationCache(): Map<string, ScopedAgentUIObservation> {
  const host = window as unknown as Record<symbol, Map<string, ScopedAgentUIObservation> | undefined>;
  return host[CACHE_KEY] ??= new Map();
}
export function publishAgentUIObservation(observation: AgentUIObservation, development = false, application?: { agentId: string }): void {
  if (!development) return;
  const detail: ScopedAgentUIObservation = { ...observation, ...(application ? { agentId: application.agentId } : {}) };
  const cache = observationCache();
  const suffix = detail.type === "runtime-diagnostic"
    ? `${detail.type}:${detail.diagnostic.appUIModelHash}:${detail.diagnostic.kind}:${detail.diagnostic.instanceId}:${detail.diagnostic.eventName}`
    : detail.type;
  const key = JSON.stringify([application?.agentId, suffix]);
  cache.delete(key);
  cache.set(key, detail);
  if (cache.size > 130) {
    const oldestDiagnostic = [...cache.keys()].find(key => key.includes("runtime-diagnostic:"));
    if (oldestDiagnostic !== undefined) cache.delete(oldestDiagnostic);
  }
  window.dispatchEvent(new CustomEvent(AGENT_UI_OBSERVATION_EVENT, { detail }));
}
export function subscribeAgentUIObservationReplay(): () => void {
  const replay = () => {
    for (const detail of observationCache().values()) {
      if (detail.type === "preview-committed" && !detail.root.isConnected) continue;
      window.dispatchEvent(new CustomEvent(AGENT_UI_OBSERVATION_EVENT, { detail }));
    }
  };
  window.addEventListener(REQUEST_EVENT, replay);
  return () => window.removeEventListener(REQUEST_EVENT, replay);
}
