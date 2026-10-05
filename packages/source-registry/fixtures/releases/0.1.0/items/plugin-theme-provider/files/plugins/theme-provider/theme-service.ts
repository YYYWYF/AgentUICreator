import { isAgentUITheme, type AgentUITheme } from "@agent-ui/react";
import type { AgentUIThemeService } from "../../services/agent-ui-theme";

export function readAgentUITheme(value: unknown): AgentUITheme {
  return isAgentUITheme(value) ? value : "light";
}

export function createAgentUIThemeService(initialTheme: AgentUITheme): AgentUIThemeService {
  let theme = readAgentUITheme(initialTheme);
  const listeners = new Set<() => void>();
  return {
    getTheme: () => theme,
    setTheme: (nextTheme) => {
      if (!isAgentUITheme(nextTheme) || theme === nextTheme) return;
      theme = nextTheme;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
