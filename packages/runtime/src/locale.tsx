import { useOptionalAgentUIProject } from "./ui/project-context.js";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { enUS } from "./locales/en-US.js";
import { zhCN } from "./locales/zh-CN.js";
export type AgentUILocaleCode = "en-US" | "zh-CN";
export type AgentUILocaleMessageMap = Record<string, Record<string, string>>;
export type AgentUILocaleMessages = typeof enUS & AgentUILocaleMessageMap;
export type AgentUILocaleOverrides = {
  [namespace: string]: Partial<Record<string, string>> | undefined;
};
export const AGENT_UI_RUNTIME_LOCALES = { "en-US": enUS, "zh-CN": zhCN };
const Context = createContext({
  locale: "en-US" as AgentUILocaleCode,
  messages: enUS as AgentUILocaleMessages,
});
export function mergeAgentUILocaleOverrides(
  base: AgentUILocaleOverrides = {},
  overrides: AgentUILocaleOverrides = {},
): AgentUILocaleOverrides {
  return Object.fromEntries(
    [...new Set([...Object.keys(base), ...Object.keys(overrides)])].map(
      (key) => [key, { ...base[key], ...overrides[key] }],
    ),
  );
}
/** Runtime owns only its own copy. Plugin namespaces enter through composition. */
export function resolveAgentUILocaleMessages(
  locale: AgentUILocaleCode,
  overrides: AgentUILocaleOverrides = {},
): AgentUILocaleMessages {
  return mergeAgentUILocaleOverrides(
    AGENT_UI_RUNTIME_LOCALES[locale],
    overrides,
  ) as AgentUILocaleMessages;
}
export function AgentUILocaleProvider({
  locale = "en-US",
  messages,
  children,
}: {
  locale?: AgentUILocaleCode | undefined;
  messages?: AgentUILocaleOverrides | undefined;
  children: ReactNode;
}) {
  const resolver =
    useOptionalAgentUIProject()?.presentation?.resolveLocale ??
    resolveAgentUILocaleMessages;
  const value = useMemo(
    () => ({
      locale,
      messages: mergeAgentUILocaleOverrides(
        resolver(locale),
        messages,
      ) as AgentUILocaleMessages,
    }),
    [locale, messages, resolver],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAgentUILocale(): AgentUILocaleMessages;
export function useAgentUILocale<N extends keyof AgentUILocaleMessages>(
  namespace: N,
): AgentUILocaleMessages[N];
export function useAgentUILocale(namespace?: string) {
  const { messages } = useContext(Context);
  return namespace === undefined ? messages : messages[namespace];
}
export const useAgentUILocaleCode = () => useContext(Context).locale;
