import { useAgentUIThemeSnapshot } from "@za38.03/agent-ui-plugins/plugin-support";
import type { AgentUITheme } from "@za38.03/agent-ui-plugins";
import { AGENT_UI_THEME_SERVICE, type AgentUIThemeService } from "../../services/agent-ui-theme.js";
import { usePluginService } from "../../runtime/plugins/index.js";

export function useAgentUITheme(): AgentUITheme {
  const service = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
  return useAgentUIThemeSnapshot(service);
}
