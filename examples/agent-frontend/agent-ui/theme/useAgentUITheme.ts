import { useSyncExternalStore } from "react";

import {
  AGENT_UI_THEME_SERVICE,
  type AgentUIThemeMode,
  type AgentUIThemeService,
} from "../../services/agent-ui-theme";
import { usePluginService } from "../../runtime/plugins";

const subscribeToNothing = (): (() => void) => () => undefined;
const getDefaultThemeMode = (): AgentUIThemeMode => "light";

export function useAgentUIThemeMode(): AgentUIThemeMode {
  const themeService = usePluginService<AgentUIThemeService>(
    AGENT_UI_THEME_SERVICE,
  );

  return useSyncExternalStore(
    themeService?.subscribe ?? subscribeToNothing,
    themeService?.getMode ?? getDefaultThemeMode,
    themeService?.getMode ?? getDefaultThemeMode,
  );
}
