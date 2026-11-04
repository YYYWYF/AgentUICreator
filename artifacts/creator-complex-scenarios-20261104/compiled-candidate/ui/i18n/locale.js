import { creatorDisplayText } from "../product-presentation.js";
import { createContext, createElement, useContext, useMemo, useState } from "react";
import { enUS } from "./en-US.js";
import { zhCN } from "./zh-CN.js";
export const CREATOR_LOCALES = { "en-US": enUS, "zh-CN": zhCN };
export const DEFAULT_CREATOR_MESSAGES = zhCN;
const warnedKeys = new Set();
function warnMissingKey(key) {
    const development = import.meta.env?.DEV ?? (typeof process !== "undefined" && process.env.NODE_ENV !== "production");
    if (development && !warnedKeys.has(key)) {
        warnedKeys.add(key);
        console.warn(`Missing locale key: ${key}`);
    }
}
export function resolveCreatorLocaleMessages(locale, warn = warnMissingKey) {
    const selected = CREATOR_LOCALES[locale];
    const result = {};
    for (const [namespace, defaults] of Object.entries(DEFAULT_CREATOR_MESSAGES)) {
        const group = selected?.[namespace];
        result[namespace] = {};
        for (const [key, fallback] of Object.entries(defaults)) {
            const value = group?.[key];
            if (typeof value !== "string" || !value)
                warn(`${namespace}.${key}`);
            result[namespace][key] = value || fallback || `${namespace}.${key}`;
        }
    }
    return result;
}
const LocaleContext = createContext({ locale: "zh-CN", messages: DEFAULT_CREATOR_MESSAGES, setLocale: (_locale) => { } });
/** Tool-host presentation state; never passed to the generated application's protocol or model. */
export function CreatorLocaleProvider({ children, locale, onLocaleChange }) {
    const [selected, setSelected] = useState("zh-CN");
    const current = locale ?? selected;
    const value = useMemo(() => ({ locale: current, messages: resolveCreatorLocaleMessages(current), setLocale: (next) => { setSelected(next); onLocaleChange?.(next); } }), [current, onLocaleChange]);
    return createElement(LocaleContext.Provider, { value }, children);
}
export function useAgentUILocale(namespace) {
    const { messages } = useContext(LocaleContext);
    return namespace === undefined ? messages : messages[namespace];
}
export function useCreatorLocaleState() { return useContext(LocaleContext); }
export function formatLocaleMessage(template, ...values) {
    return creatorDisplayText(template.replace(/\{(\d+)\}/g, (match, index) => Number(index) < values.length ? String(values[Number(index)]) : match));
}
const displayCopyPatterns = Object.values(CREATOR_LOCALES).flatMap(catalog => Object.entries(catalog).flatMap(([namespace, group]) => Object.entries(group).map(([key, text]) => {
    const indices = [];
    const fragments = text.split(/(\{\d+\})/g).map(fragment => {
        const placeholder = /^\{(\d+)\}$/.exec(fragment);
        if (placeholder) {
            indices.push(Number(placeholder[1]));
            return "([\\s\\S]*?)";
        }
        return fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    });
    return { namespace, key, text, pattern: new RegExp("^" + fragments.join("") + "$"), indices };
})));
const exactDisplayCopy = new Map();
for (const entry of displayCopyPatterns)
    if (entry.indices.length === 0 && !exactDisplayCopy.has(entry.text))
        exactDisplayCopy.set(entry.text, entry);
const templatedDisplayCopy = displayCopyPatterns.filter(entry => entry.indices.length > 0 && (entry.namespace === "mock" || entry.namespace === "pluginUpdates" || entry.namespace === "commands" ||
    (entry.namespace === "creatorWorkbench" && ["refreshPartiallyCompletedCouldNotBeReadPlease", "initializationOutcomeUnconfirmedCouldNotRefreshProjectState"].includes(entry.key))));
/** Re-project transient product notices when locale changes; never touch Agent or user content. */
export function localizeCreatorPresentation(text, messages) {
    if (!text)
        return text;
    const exact = exactDisplayCopy.get(text);
    if (exact) {
        const group = messages[exact.namespace];
        return creatorDisplayText(group[exact.key] ?? text);
    }
    for (const entry of templatedDisplayCopy) {
        const match = entry.pattern.exec(text);
        if (!match)
            continue;
        const group = messages[entry.namespace];
        const template = group[entry.key];
        if (!template)
            return creatorDisplayText(text);
        const values = [];
        entry.indices.forEach((index, capture) => { values[index] = match[capture + 1]; });
        return creatorDisplayText(formatLocaleMessage(template, ...values));
    }
    return creatorDisplayText(text);
}
//# sourceMappingURL=locale.js.map