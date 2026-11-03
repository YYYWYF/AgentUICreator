import type { AgentUITheme, AgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import type { AppUIModel } from "../framework/contracts/app-ui-model.js";

/** Host configuration; composition uses the existing AppUIModel unchanged. */
export interface AgentUICompatibilityConfig {
  endpoint?: string;
  locale?: AgentUILocaleCode;
  theme?: AgentUITheme;
  /** Persisted conversation identity; requires the project history service. */
  threadId?: string;
  appUIModel?: AppUIModel;
}

export type ResolvedAgentUICompatibilityConfig = AgentUICompatibilityConfig & { endpoint: string; locale: AgentUILocaleCode };
export interface AgentUIEventDetails {
  "agent-ready": { threadId: string };
  "thread-change": { threadId: string };
  "theme-change": { theme: AgentUITheme };
  "agent-error": { code: "AGENT_UI_CONFIG_ERROR" | "AGENT_UI_RUNTIME_ERROR"; error: Error };
}
export type AgentUIEmit = <K extends keyof AgentUIEventDetails>(type: K, detail: AgentUIEventDetails[K]) => void;
