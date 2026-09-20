import type { AgentUIThemeMode } from "../../services/agent-ui-theme";

export const DEFAULT_AGENT_UI_THEME_MODE: AgentUIThemeMode = "dark";

export const agentUIThemeConfig = {
  defaultMode: DEFAULT_AGENT_UI_THEME_MODE,
} as const;
