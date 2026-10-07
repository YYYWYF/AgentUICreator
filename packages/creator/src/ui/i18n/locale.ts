import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from "react";
import { enUS } from "./en-US.js";
import { zhCN } from "./zh-CN.js";

export type CreatorLocaleCode = "en-US" | "zh-CN";
export type CreatorLocaleMessages = { [N in keyof typeof zhCN]: { [K in keyof (typeof zhCN)[N]]: string } };
export const CREATOR_LOCALES: Record<CreatorLocaleCode, CreatorLocaleMessages> = { "en-US": enUS, "zh-CN": zhCN };
export const DEFAULT_CREATOR_MESSAGES: CreatorLocaleMessages = zhCN;

const warnedKeys = new Set<string>();
function warnMissingKey(key: string) {
  const development = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV ?? (typeof process !== "undefined" && process.env.NODE_ENV !== "production");
  if (development && !warnedKeys.has(key)) { warnedKeys.add(key); console.warn(`Missing locale key: ${key}`); }
}
export function resolveCreatorLocaleMessages(locale: CreatorLocaleCode, warn: (key: string) => void = warnMissingKey): CreatorLocaleMessages {
  const selected = CREATOR_LOCALES[locale];
  const result: Record<string, Record<string, string>> = {};
  for (const [namespace, defaults] of Object.entries(DEFAULT_CREATOR_MESSAGES)) {
    const group = selected?.[namespace as keyof CreatorLocaleMessages] as Record<string, string> | undefined;
    result[namespace] = {};
    for (const [key, fallback] of Object.entries(defaults)) {
      const value = group?.[key];
      if (typeof value !== "string" || !value) warn(`${namespace}.${key}`);
      result[namespace]![key] = value || fallback || `${namespace}.${key}`;
    }
  }
  return result as CreatorLocaleMessages;
}

const LocaleContext = createContext({ locale: "zh-CN" as CreatorLocaleCode, messages: DEFAULT_CREATOR_MESSAGES, setLocale: (_locale: CreatorLocaleCode) => {} });

/** Tool-host presentation state; never passed to the generated application's protocol or model. */
export function CreatorLocaleProvider({ children, locale, onLocaleChange }: { children: ReactNode; locale?: CreatorLocaleCode | undefined; onLocaleChange?: ((locale: CreatorLocaleCode) => void) | undefined }) {
  const [selected, setSelected] = useState<CreatorLocaleCode>("zh-CN");
  const current = locale ?? selected;
  const value = useMemo(() => ({ locale: current, messages: resolveCreatorLocaleMessages(current), setLocale: (next: CreatorLocaleCode) => { setSelected(next); onLocaleChange?.(next); } }), [current, onLocaleChange]);
  return createElement(LocaleContext.Provider, { value }, children);
}
export function useAgentUILocale(): CreatorLocaleMessages;
export function useAgentUILocale<N extends keyof CreatorLocaleMessages>(namespace: N): CreatorLocaleMessages[N];
export function useAgentUILocale(namespace?: keyof CreatorLocaleMessages) {
  const { messages } = useContext(LocaleContext);
  return namespace === undefined ? messages : messages[namespace];
}
export function useCreatorLocaleState() { return useContext(LocaleContext); }
export function formatLocaleMessage(template: string, ...values: unknown[]): string {
  return template.replace(/\{(\d+)\}/g, (match, index: string) => Number(index) < values.length ? String(values[Number(index)]) : match);
}
