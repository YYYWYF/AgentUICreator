export interface TransientMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly role: "user" | "assistant" | "system";
  readonly type: "normal" | "error";
  readonly text: string;
  readonly afterMessageId: string | null;
  readonly afterMessageIndex: number;
}

export interface TransientMessageTarget {
  readonly conversationId: string;
  readonly messageIds: readonly string[];
}

export interface ConversationTransientMessageService {
  /** Display only: never appends to the Agent runtime or calls a transport. */
  addMessage(input: { role: "user" | "assistant" | "system"; type?: "normal" | "error"; text: string }): string;
  getSnapshot(conversationId: string): readonly TransientMessage[];
  subscribe(listener: () => void): () => void;
  /** Runtime composition seam. The getter reads the active conversation at call time. */
  bindTarget(getTarget: () => TransientMessageTarget): () => void;
}

const EMPTY: readonly TransientMessage[] = Object.freeze([]);

/** One service per mounted application; no storage, network or module-global state. */
export function createConversationTransientMessageService(): ConversationTransientMessageService {
  const messages = new Map<string, readonly TransientMessage[]>();
  const listeners = new Set<() => void>();
  let target: (() => TransientMessageTarget) | undefined;
  return {
    bindTarget(getTarget) {
      target = getTarget;
      return () => { if (target === getTarget) target = undefined; };
    },
    addMessage({ role, type = "normal", text }) {
      if (role !== "user" && role !== "assistant" && role !== "system") throw new Error("Transient message role must be user, assistant or system");
      if (type !== "normal" && type !== "error") throw new Error("Transient message type must be normal or error");
      if (typeof text !== "string" || text.trim().length === 0) throw new Error("A transient message requires non-empty text");
      if (target === undefined) throw new Error("Transient messages require a mounted ConversationRuntimeProvider");
      const { conversationId, messageIds } = target();
      const message: TransientMessage = Object.freeze({
        id: `notice-${crypto.randomUUID()}`, conversationId, role, type, text,
        afterMessageId: messageIds.at(-1) ?? null,
        afterMessageIndex: messageIds.length - 1,
      });
      messages.set(conversationId, Object.freeze([...messages.get(conversationId) ?? EMPTY, message]));
      listeners.forEach(listener => listener());
      return message.id;
    },
    getSnapshot: conversationId => messages.get(conversationId) ?? EMPTY,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

/** Streaming may replace an optimistic ID; retain its ordinal placement in that case. */
export function resolveTransientMessageAnchor(message: TransientMessage, messageIds: readonly string[]): string | null {
  if (message.afterMessageId !== null && messageIds.includes(message.afterMessageId)) return message.afterMessageId;
  return messageIds[Math.min(message.afterMessageIndex, messageIds.length - 1)] ?? null;
}
