import { useCallback, useSyncExternalStore } from "react";
import { AGENT_UI_DEFAULT_THEME, type AgentUITheme } from "../theme/theme-contract.js";

export interface AgentUIThemeSource {
  getTheme(): AgentUITheme;
  subscribe(listener: () => void): () => void;
}

/** Reads the supplied shared service without creating a separate theme store. */
export function useAgentUIThemeSnapshot(service: AgentUIThemeSource | undefined): AgentUITheme {
  const subscribe = useCallback((listener: () => void) => service?.subscribe(listener) ?? (() => {}), [service]);
  const getSnapshot = useCallback(() => service?.getTheme() ?? AGENT_UI_DEFAULT_THEME, [service]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
