import type { AgentUITheme, AgentUILocaleCode } from "@agent-ui/react";
import type { ConversationRuntimeProviderProps } from "@agent-ui/runtime-conversation";
import type { AppUIModel } from "../.generated/src/agent-ui/framework/contracts/app-ui-model";

/** Host configuration; composition uses the existing AppUIModel unchanged. */
export interface AgentUIConfig {
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
export type ResolvedAgentUIConfig = AgentUIConfig & { endpoint: string; locale: AgentUILocaleCode; theme: AgentUITheme };
export const configAttributes = ["endpoint", "locale", "theme", "thread-id"] as const;

export function resolveConfig(config: AgentUIConfig, attributes: Record<string, string | null>): ResolvedAgentUIConfig {
  // Properties are authoritative. Attributes are sugar only when a property is absent.
  const resolved = {
    ...config,
    endpoint: config.endpoint ?? attributes.endpoint ?? "/agent",
    locale: config.locale ?? attributes.locale ?? "en-US",
    theme: config.theme ?? attributes.theme ?? "violet",
    ...(config.threadId !== undefined || attributes["thread-id"] !== null
      ? { threadId: config.threadId ?? attributes["thread-id"] ?? undefined } : {}),
  };
  if (typeof resolved.endpoint !== "string" || !resolved.endpoint.trim()) throw new Error("Invalid Agent UI endpoint.");
  if (!["en-US", "zh-CN"].includes(resolved.locale)) throw new Error("Invalid Agent UI locale.");
  if (!["light", "dark", "violet"].includes(resolved.theme)) throw new Error("Invalid Agent UI theme.");
  if (resolved.threadId !== undefined && (typeof resolved.threadId !== "string" || !resolved.threadId.trim())) throw new Error("Invalid Agent UI thread identity.");
  if (config.conversationDataEndpoint !== undefined && (typeof config.conversationDataEndpoint !== "string" || !config.conversationDataEndpoint.trim())) throw new Error("Invalid conversation API base.");
  return resolved as ResolvedAgentUIConfig;
}
