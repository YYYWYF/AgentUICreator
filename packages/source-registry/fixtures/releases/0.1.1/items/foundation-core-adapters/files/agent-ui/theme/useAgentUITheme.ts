import { useSyncExternalStore } from "react";
import type { AgentUITheme } from "@agent-ui/react";
import { AGENT_UI_THEME_SERVICE, type AgentUIThemeService } from "../../services/agent-ui-theme";
import { usePluginService } from "../../runtime/plugins";
import { agentUIThemeConfig } from "./theme-config";

const subscribeToNothing = (): (() => void) => () => undefined;
const getDefaultTheme = (): AgentUITheme => agentUIThemeConfig.theme;

export function useAgentUITheme(): AgentUITheme {
  const themeService = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
  return useSyncExternalStore(
    themeService?.subscribe ?? subscribeToNothing,
    themeService?.getTheme ?? getDefaultTheme,
    themeService?.getTheme ?? getDefaultTheme,
  );
}
