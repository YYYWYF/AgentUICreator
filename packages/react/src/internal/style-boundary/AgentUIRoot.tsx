import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { getAgentUIThemeColorScheme, type AgentUITheme } from "../../theme/theme-contract.js";

const AgentUIPortalContext = createContext<HTMLElement | null | undefined>(undefined);

const hostPresentationProperties = ["font-family", "font-size", "font-weight", "font-style", "line-height", "color-scheme"] as const;

/** The single style and overlay boundary for one mounted Agent UI. */
export function AgentUIRoot({ theme, children }: {
  theme: AgentUITheme;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const colorScheme = getAgentUIThemeColorScheme(theme);
  useLayoutEffect(() => {
    const element = rootRef.current;
    const host = element?.parentElement;
    const view = element?.ownerDocument.defaultView;
    if (!element || !host || !view) return;
    // Preserve the Host's inherited typography before crossing our presentation
    // boundary. Plugin mounts reuse these values, including explicit line height.
    const syncTypography = () => {
      const hostStyle = view.getComputedStyle(host);
      const presentationStyle = view.getComputedStyle(element);
      for (const property of hostPresentationProperties) {
        element.style.setProperty(`--agent-ui-host-${property}`, hostStyle.getPropertyValue(property));
        element.style.setProperty(`--agent-ui-presentation-${property}`, presentationStyle.getPropertyValue(property));
      }
    };
    syncTypography();
    const observer = new view.MutationObserver(syncTypography);
    for (let ancestor: HTMLElement | null = host; ancestor; ancestor = ancestor.parentElement) {
      observer.observe(ancestor, { attributes: true, attributeFilter: ["class", "style", "data-theme", "data-color-scheme"] });
    }
    view.addEventListener("resize", syncTypography);
    return () => {
      observer.disconnect();
      view.removeEventListener("resize", syncTypography);
    };
  }, [theme]);
  return (
    <div ref={rootRef} data-agent-ui-owned="" className={colorScheme === "dark" ? "agent-ui-root dark" : "agent-ui-root"} data-agent-ui-root="" data-theme={theme} data-color-scheme={colorScheme}>
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
