import { useSyncExternalStore } from "react";
import { AGENT_UI_DEFAULT_THEME, type AgentUITheme } from "@za38.03/agent-ui-plugins";
import { AGENT_UI_THEME_SERVICE, type AgentUIThemeService } from "../../services/agent-ui-theme";
import { usePluginService } from "../../runtime/plugins";

const subscribeToNothing = (): (() => void) => () => undefined;
const getDefaultTheme = (): AgentUITheme => AGENT_UI_DEFAULT_THEME;

export function useAgentUITheme(): AgentUITheme {
  const themeService = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
  return useSyncExternalStore(
    themeService?.subscribe ?? subscribeToNothing,
    themeService?.getTheme ?? getDefaultTheme,
    themeService?.getTheme ?? getDefaultTheme,
  );
}
