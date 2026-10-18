import type { AgentUILocaleCode } from "../../../../public.js";
export interface AgentUILocaleSnapshot {locale:AgentUILocaleCode;direction:"ltr"|"rtl";}
export interface AgentUILocaleService {getSnapshot():AgentUILocaleSnapshot;subscribe(listener:()=>void):()=>void;setLocale(locale:AgentUILocaleCode):void;}
function createSnapshot(locale: AgentUILocaleCode): AgentUILocaleSnapshot {
  return {
    locale,
    direction: "ltr",
  };
}

export function createAgentUILocaleService(
  initialLocale: AgentUILocaleCode,
): AgentUILocaleService {
  let snapshot = createSnapshot(initialLocale);
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setLocale: (locale) => {
      if (snapshot.locale === locale) return;
      snapshot = createSnapshot(locale);
      listeners.forEach((listener) => listener());
    },
  };
}
