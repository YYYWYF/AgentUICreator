import { AGENT_UI_LOCALE_METADATA } from "../../agent-ui/i18n/locale-registry";
import type { AgentUILocaleCode } from "../../agent-ui/i18n/locale-types";
import type {
  AgentUILocaleService,
  AgentUILocaleSnapshot,
} from "../../services/agent-ui-locale";

function createSnapshot(locale: AgentUILocaleCode): AgentUILocaleSnapshot {
  return {
    locale,
    direction: AGENT_UI_LOCALE_METADATA[locale].direction,
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
