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

const displayCopyPatterns = Object.values(CREATOR_LOCALES).flatMap(catalog =>
  Object.entries(catalog).flatMap(([namespace, group]) => Object.entries(group).map(([key, text]) => {
    const indices: number[] = [];
    const fragments = text.split(/(\{\d+\})/g).map(fragment => {
      const placeholder = /^\{(\d+)\}$/.exec(fragment);
      if (placeholder) { indices.push(Number(placeholder[1])); return "([\\s\\S]*?)"; }
      return fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    });
    return { namespace, key, text, pattern: new RegExp("^" + fragments.join("") + "$"), indices };
  })),
);
const exactDisplayCopy = new Map<string, (typeof displayCopyPatterns)[number]>();
for (const entry of displayCopyPatterns) if (entry.indices.length === 0 && !exactDisplayCopy.has(entry.text)) exactDisplayCopy.set(entry.text, entry);
const templatedDisplayCopy = displayCopyPatterns.filter(entry => entry.indices.length > 0 && (
  entry.namespace === "mock" || entry.namespace === "pluginUpdates" ||
  (entry.namespace === "creatorWorkbench" && ["refreshPartiallyCompletedCouldNotBeReadPlease", "initializationOutcomeUnconfirmedCouldNotRefreshProjectState"].includes(entry.key))
));
/** Re-project transient product notices when locale changes; never touch Agent or user content. */
export function localizeCreatorPresentation(text: string | null | undefined, messages: CreatorLocaleMessages): string | null | undefined {
  if (!text) return text;
  const exact = exactDisplayCopy.get(text);
  if (exact) {
    const group = messages[exact.namespace as keyof CreatorLocaleMessages] as Record<string, string>;
    return group[exact.key] ?? text;
  }
  for (const entry of templatedDisplayCopy) {
    const match = entry.pattern.exec(text);
    if (!match) continue;
    const group = messages[entry.namespace as keyof CreatorLocaleMessages] as Record<string, string>;
    const template = group[entry.key];
    if (!template) return text;
    const values: unknown[] = [];
    entry.indices.forEach((index, capture) => { values[index] = match[capture + 1]; });
    return formatLocaleMessage(template, ...values);
  }
  return text;
}
