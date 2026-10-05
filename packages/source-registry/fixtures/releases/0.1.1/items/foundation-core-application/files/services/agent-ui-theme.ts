import type { AgentUITheme } from "@agent-ui/react";
export type { AgentUITheme, AgentUIColorScheme, AgentUIThemeConfig } from "@agent-ui/react";

export const AGENT_UI_THEME_SERVICE = "agent-ui.theme" as const;

export interface AgentUIThemeService {
  getTheme(): AgentUITheme;
  setTheme(theme: AgentUITheme): void;
  subscribe(listener: () => void): () => void;
}

declare module "../framework/contracts/ui-plugin" {
  interface UIPluginServiceMap {
    [AGENT_UI_THEME_SERVICE]: AgentUIThemeService;
  }
}
