import type {ComponentType,ReactNode} from "react";
import type { AgentUITheme } from "../../presentation.js";
export type { AgentUITheme, AgentUIColorScheme } from "../../presentation.js";

export const AGENT_UI_THEME_SERVICE = "agent-ui.theme" as const;

export interface AgentUIThemeService {
  Root?: ComponentType<{theme:string;children:ReactNode}>;
  getTheme(): AgentUITheme;
  setTheme(theme: AgentUITheme): void;
  subscribe(listener: () => void): () => void;
}

declare module "@za38.03/agent-ui-runtime/contracts" {
  interface UIPluginServiceMap {
    [AGENT_UI_THEME_SERVICE]: AgentUIThemeService;
  }
}
