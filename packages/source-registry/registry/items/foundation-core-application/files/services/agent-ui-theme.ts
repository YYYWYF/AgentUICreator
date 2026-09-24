export const AGENT_UI_THEME_SERVICE = "agent-ui.theme" as const;

export type AgentUIThemeMode = "light" | "dark";

export interface AgentUIThemeService {
  getMode(): AgentUIThemeMode;
  setMode(mode: AgentUIThemeMode): void;
  toggle(): void;
  subscribe(listener: () => void): () => void;
}

declare module "../framework/contracts/ui-plugin" {
  interface UIPluginServiceMap {
    [AGENT_UI_THEME_SERVICE]: AgentUIThemeService;
  }
}
