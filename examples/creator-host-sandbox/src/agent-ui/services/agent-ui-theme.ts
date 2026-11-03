import type { AgentUITheme } from "@za38.03/agent-ui-plugins";
export type { AgentUITheme, AgentUIColorScheme } from "@za38.03/agent-ui-plugins";

export const AGENT_UI_THEME_SERVICE = "agent-ui.theme" as const;

export interface AgentUIThemeService {
  getTheme(): AgentUITheme;
  setTheme(theme: AgentUITheme): void;
  subscribe(listener: () => void): () => void;
}

declare module "@za38.03/agent-ui-plugins/contracts" {
  interface UIPluginServiceMap {
    [AGENT_UI_THEME_SERVICE]: AgentUIThemeService;
  }
}
