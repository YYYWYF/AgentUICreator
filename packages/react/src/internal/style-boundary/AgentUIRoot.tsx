import { createContext, useContext, useState, type ReactNode } from "react";

const AgentUIPortalContext = createContext<HTMLElement | null | undefined>(undefined);

/** The single style and overlay boundary for one mounted Agent UI. */
export function AgentUIRoot({ theme, children }: {
  theme: "light" | "dark";
  children: ReactNode;
}) {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  return (
    <div className={theme === "dark" ? "agent-ui-root dark" : "agent-ui-root"} data-agent-ui-root="" data-theme={theme}>
      <AgentUIPortalContext.Provider value={portalContainer}>
        {children}
      </AgentUIPortalContext.Provider>
      <div ref={setPortalContainer} className="agent-ui-portal-root" data-agent-ui-portal-root="" />
    </div>
  );
}

/** Undefined means a legacy standalone Conversation without AgentUIRoot. */
export function useAgentUIPortalContainer(): HTMLElement | null | undefined {
  return useContext(AgentUIPortalContext);
}
