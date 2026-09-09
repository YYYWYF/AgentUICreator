import { createContext, useContext } from "react";

export interface AgentUIRootContextValue {
  portalContainer: HTMLElement | null;
}

export const AgentUIRootContext = createContext<AgentUIRootContextValue | null>(null);

export function useAgentUIRoot(): AgentUIRootContextValue {
  const context = useContext(AgentUIRootContext);
  if (context === null) {
    throw new Error("Agent UI primitives must render inside AgentUIRoot.");
  }
  return context;
}
