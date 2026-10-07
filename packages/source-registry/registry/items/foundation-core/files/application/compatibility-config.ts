import type { AgentUITheme, AgentUILocaleCode } from "@agent-ui/react";
import type { ConversationRuntimeProviderProps } from "@agent-ui/runtime-conversation";
import type { AppUIModel } from "../framework/contracts/app-ui-model";

/** Host configuration; composition uses the existing AppUIModel unchanged. */
export interface AgentUICompatibilityConfig {
  endpoint?: string;
  locale?: AgentUILocaleCode;
  theme?: AgentUITheme;
  /** Persisted conversation identity; requires conversationDataEndpoint. */
  threadId?: string;
  /** Existing conversation API base, not the /conversations list URL. */
  conversationDataEndpoint?: string;
  appUIModel?: AppUIModel;
  attachmentAdapter?: ConversationRuntimeProviderProps["attachmentAdapter"];
}

export type ResolvedAgentUICompatibilityConfig = AgentUICompatibilityConfig & { endpoint: string; locale: AgentUILocaleCode; theme: AgentUITheme };
export interface AgentUIEventDetails {
  "agent-ready": { threadId: string };
  "thread-change": { threadId: string };
  "agent-error": { code: "AGENT_UI_CONFIG_ERROR" | "AGENT_UI_RUNTIME_ERROR"; error: Error };
}
export type AgentUIEmit = <K extends keyof AgentUIEventDetails>(type: K, detail: AgentUIEventDetails[K]) => void;
