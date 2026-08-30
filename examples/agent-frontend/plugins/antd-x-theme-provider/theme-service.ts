export const AGENT_UI_THEME_SERVICE = "agent-ui.theme" as const;

export type AgentUIThemeMode = "light" | "dark";

export interface AgentUIThemeService {
  getMode(): AgentUIThemeMode;
  setMode(mode: AgentUIThemeMode): void;
  toggle(): void;
  subscribe(listener: () => void): () => void;
}

declare module "../../framework/contracts/ui-plugin" {
  interface UIPluginServiceMap {
    [AGENT_UI_THEME_SERVICE]: AgentUIThemeService;
  }
}

export function readAgentUIThemeMode(value: unknown): AgentUIThemeMode {
  return value === "light" ? "light" : "dark";
}

export function createAgentUIThemeService(
  initialMode: AgentUIThemeMode,
  onModeChange: (mode: AgentUIThemeMode) => void,
): AgentUIThemeService {
  let mode = initialMode;
  const listeners = new Set<() => void>();

  const service: AgentUIThemeService = {
    getMode: () => mode,
    setMode: (nextMode) => {
      if (mode === nextMode) {
        return;
      }

      mode = nextMode;
      listeners.forEach((listener) => listener());
      onModeChange(mode);
    },
    toggle: () => {
      service.setMode(mode === "dark" ? "light" : "dark");
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return service;
}
