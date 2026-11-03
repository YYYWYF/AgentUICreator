export type { AgentUICompatibilityConfig as AgentUIConfig } from "@za38.03/agent-ui-runtime/ui/application/compatibility-config";
import type { AgentUICompatibilityConfig as AgentUIConfig } from "@za38.03/agent-ui-runtime/ui/application/compatibility-config";
export type { ResolvedAgentUICompatibilityConfig as ResolvedAgentUIConfig } from "@za38.03/agent-ui-runtime/ui/application/compatibility-config";
import type { ResolvedAgentUICompatibilityConfig as ResolvedAgentUIConfig } from "@za38.03/agent-ui-runtime/ui/application/compatibility-config";
import { isAgentUITheme } from "@za38.03/agent-ui-plugins/theme";
export const configAttributes = ["endpoint", "locale", "theme", "thread-id"] as const;
export interface AgentUIPresentationDefaults { locale: ResolvedAgentUIConfig["locale"] }
const projectDefaults: AgentUIPresentationDefaults = { locale: "zh-CN" };

export function resolveConfig(config: AgentUIConfig, attributes: Record<string, string | null>, defaults: AgentUIPresentationDefaults = projectDefaults): ResolvedAgentUIConfig {
  // Properties are authoritative. Attributes are sugar only when a property is absent.
  const resolved = {
    ...config,
    endpoint: config.endpoint ?? attributes.endpoint ?? "/agent",
    locale: config.locale ?? attributes.locale ?? defaults.locale,
    theme: config.theme ?? attributes.theme ?? undefined,
    ...(config.threadId !== undefined || attributes["thread-id"] !== null
      ? { threadId: config.threadId ?? attributes["thread-id"] ?? undefined } : {}),
  };
  if (typeof resolved.endpoint !== "string" || !resolved.endpoint.trim()) throw new Error("Invalid Agent UI endpoint.");
  if (!["en-US", "zh-CN"].includes(resolved.locale)) throw new Error("Invalid Agent UI locale.");
  if (resolved.theme !== undefined && !isAgentUITheme(resolved.theme)) throw new Error("Invalid Agent UI theme.");
  if (resolved.threadId !== undefined && (typeof resolved.threadId !== "string" || !resolved.threadId.trim())) throw new Error("Invalid Agent UI thread identity.");
  return resolved as ResolvedAgentUIConfig;
}
