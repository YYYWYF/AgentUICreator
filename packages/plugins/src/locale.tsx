"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { enUS } from "./locales/en-US.js";
import { zhCN } from "./locales/zh-CN.js";

export type AgentUILocaleCode = "en-US" | "zh-CN";
export type AgentUILocaleMessages = { [N in keyof typeof enUS]: { [K in keyof (typeof enUS)[N]]: string } };
export type AgentUILocaleOverrides = { [N in keyof AgentUILocaleMessages]?: Partial<AgentUILocaleMessages[N]> };
export const DEFAULT_AGENT_UI_MESSAGES: AgentUILocaleMessages = enUS;
export const AGENT_UI_PRESENTATION_LOCALES: Record<AgentUILocaleCode, AgentUILocaleMessages> = { "en-US": enUS, "zh-CN": zhCN };
const LocaleContext = createContext({ locale: "en-US" as AgentUILocaleCode, messages: DEFAULT_AGENT_UI_MESSAGES });

const warnedKeys = new Set<string>();
function warnMissingKey(key: string) {
  const development = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV ?? (typeof process !== "undefined" && process.env.NODE_ENV !== "production");
  if (development && !warnedKeys.has(key)) { warnedKeys.add(key); console.warn(`Missing locale key: ${key}`); }
}

/** Resolves presentation-only overrides; a missing translation never breaks production rendering. */
export function resolveAgentUILocaleMessages(locale: AgentUILocaleCode, overrides?: AgentUILocaleOverrides, warn: (key: string) => void = warnMissingKey): AgentUILocaleMessages {
  const selected = AGENT_UI_PRESENTATION_LOCALES[locale];
  const result = {} as Record<string, Record<string, string>>;
  for (const [namespace, defaults] of Object.entries(DEFAULT_AGENT_UI_MESSAGES)) {
    const group = selected?.[namespace as keyof AgentUILocaleMessages] as Record<string, string> | undefined;
    const custom = overrides?.[namespace as keyof AgentUILocaleMessages] as Record<string, string> | undefined;
    result[namespace] = {};
    for (const [key, fallback] of Object.entries(defaults)) {
      const translated = group?.[key];
      if (typeof translated !== "string" || !translated) warn?.(`${namespace}.${key}`);
      result[namespace]![key] = custom?.[key] || translated || fallback;
    }
  }
  return result as AgentUILocaleMessages;
}

/** Composition bridge for hosts and generated locale services. No runtime or protocol ownership. */
export function AgentUILocaleProvider({ locale = "en-US", messages, children }: { locale?: AgentUILocaleCode | undefined; messages?: AgentUILocaleOverrides | undefined; children: ReactNode }) {
  const value = useMemo(() => ({ locale, messages: resolveAgentUILocaleMessages(locale, messages) }), [locale, messages]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function useAgentUILocale(): AgentUILocaleMessages;
export function useAgentUILocale<N extends keyof AgentUILocaleMessages>(namespace: N): AgentUILocaleMessages[N];
export function useAgentUILocale(namespace?: keyof AgentUILocaleMessages) {
  const { messages } = useContext(LocaleContext);
  return namespace === undefined ? messages : messages[namespace];
}
export function useAgentUILocaleCode(): AgentUILocaleCode { return useContext(LocaleContext).locale; }

/** Substitute presentation placeholders without interpreting inserted data. */
export function formatPresentationMessage(message: string, values: Readonly<Record<string, string | number>>): string {
  return message.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (placeholder, key: string) => Object.hasOwn(values, key) ? String(values[key]) : placeholder);
}
