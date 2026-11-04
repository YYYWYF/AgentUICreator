import { AGENT_UI_DEFAULT_THEME, isAgentUITheme, type AgentUITheme } from '../../../../public.js';
export interface AgentUIThemeService {
  getTheme(): AgentUITheme;
  setTheme(theme: AgentUITheme): void;
  subscribe(listener: () => void): () => void;
}

export function readAgentUITheme(value: unknown): AgentUITheme {
  return isAgentUITheme(value) ? value : AGENT_UI_DEFAULT_THEME;
}

export function createAgentUIThemeService(initialTheme: AgentUITheme = AGENT_UI_DEFAULT_THEME): AgentUIThemeService {
  let theme = readAgentUITheme(initialTheme);
  const listeners = new Set<() => void>();
  return {
    getTheme: () => theme,
    setTheme: (nextTheme) => {
      if (!isAgentUITheme(nextTheme) || theme === nextTheme) {
        return;
      }
      theme = nextTheme;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
