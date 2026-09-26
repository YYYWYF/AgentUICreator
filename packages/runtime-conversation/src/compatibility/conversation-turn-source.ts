import type { AgentSubscriber } from "@ag-ui/client";
import type { ThreadRuntime } from "@assistant-ui/react";
import type { ConversationTurnSource } from "@agent-ui/react";

interface SubscribableAgent { subscribe(subscriber: AgentSubscriber): { unsubscribe(): void } }

/** Root run attribution lives in the adapter, outside AG-UI and upstream messages. */
export class LiveConversationTurnSource implements ConversationTurnSource {
  private readonly byThread = new Map<string, Map<string, string>>();
  private readonly listeners = new Set<() => void>();
  private snapshot: Readonly<Record<string, string>> = Object.freeze({});
  private active: { threadId: string; runId: string; baseline: Set<string> } | undefined;
  private cleanup: (() => void) | undefined;

  constructor(private readonly agent: SubscribableAgent, private readonly thread: ThreadRuntime, private readonly getThreadId: () => string) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  start() {
    if (this.cleanup) return;
    const subscription = this.agent.subscribe({
      onRunStartedEvent: ({ event }) => {
        if (event.threadId !== this.getThreadId()) return;
        const messages = this.thread.getState().messages;
        // assistant-ui may create its running placeholder before RUN_STARTED.
        this.active = { threadId: event.threadId, runId: event.runId, baseline: new Set(messages.filter(message => message.role !== "assistant" || message.status.type !== "running").map(message => message.id)) };
        this.sync();
      },
      onRunFinishedEvent: () => { this.finish(); },
      onRunErrorEvent: () => { this.finish(); },
      onRunFinalized: () => { this.finish(); },
      onRunFailed: () => { this.finish(); },
    });
    const unsubscribeThread = this.thread.subscribe(() => this.sync());
    this.cleanup = () => { subscription.unsubscribe(); unsubscribeThread(); };
    this.sync();
  }

  sync() {
    const threadId = this.getThreadId();
    if (this.active && this.active.threadId !== threadId) this.active = undefined;
    if (this.active) {
      let ids = this.byThread.get(threadId);
      if (!ids) { ids = new Map(); this.byThread.set(threadId, ids); }
      for (const message of this.thread.getState().messages) {
        if (message.role === "assistant" && !this.active.baseline.has(message.id)) ids.set(message.id, this.active.runId);
      }
    }
    const next = Object.fromEntries(this.byThread.get(threadId) ?? []);
    const keys = Object.keys(next);
    if (keys.length === Object.keys(this.snapshot).length && keys.every(id => next[id] === this.snapshot[id])) return;
    this.snapshot = Object.freeze(next);
    for (const listener of this.listeners) listener();
  }
  private finish() { this.sync(); this.active = undefined; }
  stop() { this.cleanup?.(); this.cleanup = undefined; this.active = undefined; }
}
