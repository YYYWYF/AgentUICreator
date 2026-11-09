"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { enUS } from "./locales/en-US.js";
import { zhCN } from "./locales/zh-CN.js";

export type AgentUILocaleCode = "en-US" | "zh-CN";
export type AgentUILocaleMessages = { [N in keyof typeof enUS]: { [K in keyof (typeof enUS)[N]]: string } };
export type AgentUILocaleOverrides = { [N in keyof AgentUILocaleMessages]?: Partial<AgentUILocaleMessages[N]> };
export const DEFAULT_AGENT_UI_MESSAGES: AgentUILocaleMessages = enUS;
export const AGENT_UI_PRESENTATION_LOCALES: Record<AgentUILocaleCode, AgentUILocaleMessages> = { "en-US": enUS, "zh-CN": zhCN };
/** Merge partial namespaces without discarding unrelated project copy. Later values win. */
export function mergeAgentUILocaleOverrides(base: AgentUILocaleOverrides = {}, overrides: AgentUILocaleOverrides = {}): AgentUILocaleOverrides {
  return Object.fromEntries(Object.keys(DEFAULT_AGENT_UI_MESSAGES).map(namespace => {
    const key = namespace as keyof AgentUILocaleMessages;
    return [key, { ...base[key], ...overrides[key] }];
  }));
}
const LocaleContext = createContext({ locale: "en-US" as AgentUILocaleCode, messages: DEFAULT_AGENT_UI_MESSAGES });

declare const process: { env: { NODE_ENV?: string } };
const warnedKeys = new Set<string>();
function warnMissingKey(key: string) {
  const development = process.env.NODE_ENV !== "production";
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
      // Empty base copy declares an optional text field, such as the welcome
      // description. Required labels still reject empty overrides/translations.
      const valid = (value: unknown): value is string => typeof value === "string" && (value.length > 0 || fallback === "");
      if (!valid(translated)) warn?.(`${namespace}.${key}`);
      result[namespace]![key] = valid(custom?.[key]) ? custom![key]! : valid(translated) ? translated : fallback;
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
