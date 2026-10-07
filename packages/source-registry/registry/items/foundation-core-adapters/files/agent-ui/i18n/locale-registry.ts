import { enUS, zhCN } from "./locales";
import type {
  AgentUIDirection,
  AgentUILocaleCode,
  AgentUILocaleMessages,
} from "./locale-types";

export const AGENT_UI_LOCALES = {
  "zh-CN": zhCN,
  "en-US": enUS,
} satisfies Record<AgentUILocaleCode, AgentUILocaleMessages>;

export const AGENT_UI_LOCALE_METADATA = {
  "zh-CN": { direction: "ltr" },
  "en-US": { direction: "ltr" },
} satisfies Record<AgentUILocaleCode, { direction: AgentUIDirection }>;

const warnedKeys = new Set<string>();
/** Namespace fallbacks are presentation-only; locale never changes protocol values. */
export function resolveLocaleNamespace<K extends keyof AgentUILocaleMessages>(locale: AgentUILocaleCode, namespace: K): AgentUILocaleMessages[K] {
  const fallback = AGENT_UI_LOCALES["en-US"][namespace];
  const selected = AGENT_UI_LOCALES[locale]?.[namespace];
  const messages: Record<string, string> = {};
  const development = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV;
  for (const [key, defaultValue] of Object.entries(fallback)) {
    const value = (selected as Record<string, string> | undefined)?.[key];
    const path = `${namespace}.${key}`;
    if (!value && development && !warnedKeys.has(path)) { warnedKeys.add(path); console.warn(`Missing locale key: ${path}`); }
    messages[key] = value || defaultValue || path;
  }
  return messages as AgentUILocaleMessages[K];
}
