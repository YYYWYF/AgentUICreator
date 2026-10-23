import { useLayoutEffect, type ReactNode } from "react";
import { AgentUIRoot, type AgentUITheme } from "@za38.03/agent-ui-plugins";
import { usePluginService } from "../../runtime/plugins";
import { AGENT_UI_THEME_SERVICE, type AgentUIThemeService } from "../../services/agent-ui-theme";
import { useAgentUITheme } from "./useAgentUITheme";

/** Share the existing theme service with Host-controlled presentation, without replacing the conversation. */
export function AgentUIThemeBridge({ theme, onThemeChange, children }: {
  theme?: AgentUITheme | undefined;
  onThemeChange?: ((theme: AgentUITheme) => void) | undefined;
  children: ReactNode;
}) {
  const service = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
  const currentTheme = useAgentUITheme();
  useLayoutEffect(() => {
    if (!service) return;
    // Host prop updates are synchronization, not requests from the theme picker.
    if (theme !== undefined) service.setTheme(theme);
    let restoring = false;
    return service.subscribe(() => {
      if (restoring) return;
      const requestedTheme = service.getTheme();
      try {
        onThemeChange?.(requestedTheme);
      } finally {
        // A controlled Host must accept the request by updating its prop.
        if (theme !== undefined && requestedTheme !== theme) {
          restoring = true;
          try { service.setTheme(theme); } finally { restoring = false; }
        }
      }
    });
  }, [service, theme, onThemeChange]);
  return <AgentUIRoot theme={theme ?? currentTheme}>{children}</AgentUIRoot>;
}
