import type { AssistantUiThreadBinding } from "./types.js";

export function createEphemeralAssistantUiThreadBinding(): AssistantUiThreadBinding {
  let threadId = crypto.randomUUID();
  const listeners = new Set<() => void>();

  return {
    getThreadId: () => threadId,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async createNewThread() {
      threadId = crypto.randomUUID();
      for (const listener of listeners) listener();
      return threadId;
    },
  };
}
