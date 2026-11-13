import { useCallback, useSyncExternalStore } from "react";
import { AGENT_UI_DEFAULT_THEME, isAgentUITheme, type AgentUITheme } from "../theme/theme-contract.js";

export interface AgentUIThemeSource {
  getTheme(): string;
  subscribe(listener: () => void): () => void;
}

/** Reads the supplied shared service without creating a separate theme store. */
export function useAgentUIThemeSnapshot(service: AgentUIThemeSource | undefined): AgentUITheme {
  const subscribe = useCallback((listener: () => void) => service?.subscribe(listener) ?? (() => {}), [service]);
  const getSnapshot = useCallback(() => {const theme=service?.getTheme();return isAgentUITheme(theme)?theme:AGENT_UI_DEFAULT_THEME;}, [service]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
