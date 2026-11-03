import { useCallback, useSyncExternalStore } from "react";
import { useAgentUILocaleCode, type AgentUILocaleCode } from "../locale.js";

export interface AgentUILocaleSource {
  getSnapshot(): { locale: AgentUILocaleCode };
  subscribe(listener: () => void): () => void;
}

/** Presentation compatibility for an explicitly supplied service; applications read the locale context. */
export function useAgentUILocaleSnapshot(service: AgentUILocaleSource | undefined): AgentUILocaleCode {
  const currentLocale = useAgentUILocaleCode();
  const subscribe = useCallback((listener: () => void) => service?.subscribe(listener) ?? (() => {}), [service]);
  const getSnapshot = useCallback(() => service?.getSnapshot().locale ?? currentLocale, [service, currentLocale]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
