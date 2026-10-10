import { createContext, useContext, useState, type ReactNode } from "react";

import { getAgentUIThemeColorScheme, type AgentUITheme } from "../../theme/theme-contract.js";

const AgentUIPortalContext = createContext<HTMLElement | null | undefined>(undefined);

/** The single style and overlay boundary for one mounted Agent UI. */
export function AgentUIRoot({ theme, children }: {
  theme: AgentUITheme;
  children: ReactNode;
}) {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const colorScheme = getAgentUIThemeColorScheme(theme);
  return (
    <div data-agent-ui-owned="" className={colorScheme === "dark" ? "agent-ui-root dark" : "agent-ui-root"} data-agent-ui-root="" data-theme={theme} data-color-scheme={colorScheme}>
      <AgentUIPortalContext.Provider value={portalContainer}>
        {children}
      </AgentUIPortalContext.Provider>
      <div data-agent-ui-owned="" ref={setPortalContainer} className="agent-ui-portal-root" data-agent-ui-portal-root="" />
    </div>
  );
}

/** Undefined means a legacy standalone Conversation without AgentUIRoot. */
export function useAgentUIPortalContainer(): HTMLElement | null | undefined {
  return useContext(AgentUIPortalContext);
}

/** Nested overlays share the local presentation layer of their containing UI. */
export function AgentUIPortalContainerProvider({ container, children }: {
  container: HTMLElement;
  children: ReactNode;
}) {
  return <AgentUIPortalContext.Provider value={container}>{children}</AgentUIPortalContext.Provider>;
}
