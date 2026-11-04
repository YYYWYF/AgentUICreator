import {
  resolveAgentUILocaleMessages,
  type AgentUILocaleCode,
  type AgentUILocaleMessages,
  type AgentUILocaleOverrides,
} from '../../../../public.js';
export interface AgentUILocaleSnapshot {
  locale: AgentUILocaleCode;
  direction: 'ltr' | 'rtl';
}
export interface AgentUILocaleService {
  getSnapshot(): AgentUILocaleSnapshot;
  subscribe(listener: () => void): () => void;
  setLocale(locale: AgentUILocaleCode): void;
  getMessages(): AgentUILocaleMessages;
  setMessages(messages: Partial<Record<AgentUILocaleCode, AgentUILocaleOverrides>>): void;
}
function createSnapshot(locale: AgentUILocaleCode): AgentUILocaleSnapshot {
  return {
    locale,
    direction: 'ltr',
  };
}

export function createAgentUILocaleService(
  initialLocale: AgentUILocaleCode = 'zh-CN',
  initialMessages: Partial<Record<AgentUILocaleCode, AgentUILocaleOverrides>> = {},
): AgentUILocaleService {
  let snapshot = createSnapshot(initialLocale);
  let messages = initialMessages;
  const listeners = new Set<() => void>();

  return {
    getMessages: () => resolveAgentUILocaleMessages(snapshot.locale, messages[snapshot.locale]),
    setMessages: (next) => {
      if (messages === next) {
        return;
      }
      messages = next;
      listeners.forEach((listener) => listener());
    },
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setLocale: (locale) => {
      if (snapshot.locale === locale) {
        return;
      }
      snapshot = createSnapshot(locale);
      listeners.forEach((listener) => listener());
    },
  };
}
