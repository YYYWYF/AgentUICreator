import type {
  AgentUIThemeMode,
  AgentUIThemeService,
} from "../../services/agent-ui-theme";

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
