import type { AgentUITheme } from "../../presentation.js";
import type { AgentUILocaleCode } from "../../locale.js";
import type { AppUIModel } from "../framework/contracts/app-ui-model.js";
import type { ServiceRequestConfig } from "../../service-config.js";

export interface AgentUIEmbeddedAgent {
  agentId: string;
  endpoint: string;
  hidden?: boolean;
  threadId?: string;
  request?: ServiceRequestConfig;
  appUIModel?: AppUIModel;
}

/** Host configuration; composition uses the existing AppUIModel unchanged. */
export interface AgentUICompatibilityConfig {
  agents?: readonly AgentUIEmbeddedAgent[];
  endpoint?: string;
  locale?: AgentUILocaleCode;
  theme?: AgentUITheme;
  /** Persisted conversation identity; requires the project history service. */
  threadId?: string;
  appUIModel?: AppUIModel;
}

export type ResolvedAgentUICompatibilityConfig = AgentUICompatibilityConfig & { endpoint: string; locale: AgentUILocaleCode };
export interface AgentUIEventDetails {
  "agent-ready": { threadId: string; agentId?: string };
  "thread-change": { threadId: string; agentId?: string };
  "theme-change": { theme: AgentUITheme; agentId?: string };
  "agent-error": { code: "AGENT_UI_CONFIG_ERROR" | "AGENT_UI_RUNTIME_ERROR"; error: Error; agentId?: string };
}
export type AgentUIEmit = <K extends keyof AgentUIEventDetails>(type: K, detail: AgentUIEventDetails[K]) => void;
