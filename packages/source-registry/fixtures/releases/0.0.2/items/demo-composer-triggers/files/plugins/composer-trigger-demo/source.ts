import type { ConversationMentionItem, ConversationMentionSource } from "@agent-ui/react";
export interface DemoMentionSource extends ConversationMentionSource { setItems(items: readonly ConversationMentionItem[], locale: string): void; }
export function createDemoMentionSource(): DemoMentionSource {
  let items: readonly ConversationMentionItem[] = [];
  let revision = 0;
  const listeners = new Set<() => void>();
  return {
    cacheKey: "demo-roster:empty",
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setItems(next, locale) {
      items = next; this.cacheKey = `demo-roster:${locale}:${++revision}`;
      listeners.forEach(listener => listener());
    },
    async search({ query, signal }) {
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
        const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
        const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 80);
        signal.addEventListener("abort", abort, { once: true });
      });
      return items.filter(item => `${item.label} ${item.description ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    },
  };
}
