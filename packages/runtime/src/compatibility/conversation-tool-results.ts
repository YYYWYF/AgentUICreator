import type { AbstractAgent, AgentSubscriber } from '@ag-ui/client';
import type { ThreadAssistantMessage, ThreadMessage, ThreadRuntime, ToolCallMessagePart } from '@assistant-ui/react';
import type { ConversationToolResultMessage } from '../plugin-api/tool-results.js';

interface ToolResultStream {
  readonly scope: string | undefined;
  text?: string;
  ended: boolean;
}

/** Display-only output attached to native tool calls; never creates tool messages or executes tools. */
export class ConversationToolResultStore {
  private readonly listeners = new Set<() => void>();
  private readonly active = new Map<string, ToolResultStream>();
  private readonly blocked = new Set<string>();
  private bound = new WeakMap<Date, Map<string, ToolResultStream>>();
  private readonly cache = new WeakMap<ConversationToolResultMessage, { revision: number; value: ConversationToolResultMessage }>();
  private runId: string | undefined;
  private revision = 0;
  private stops: Array<() => void> = [];

  constructor(private readonly agent: Pick<AbstractAgent, 'subscribe'>,
    private readonly thread: Pick<ThreadRuntime, 'getState' | 'subscribe'>) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getRevision = (): number => this.revision;

  readMessage<T extends ConversationToolResultMessage>(message: T): T {
    if (message.role !== 'assistant') return message;
    const cached = this.cache.get(message);
    if (cached?.revision === this.revision) return cached.value as T;
    const streams = this.bound.get(message.createdAt);
    let changed = false;
    const content = message.content.map(part => {
      if (part.type !== 'tool-call') return part;
      const messages = part.messages?.map(child => this.readMessage(child));
      const nestedChanged = messages?.some((child, index) => child !== part.messages?.[index]);
      const stream = part.toolCallId === undefined ? undefined : streams?.get(part.toolCallId);
      // The canonical result is authoritative, including empty strings and null.
      const partial = part.result === undefined && stream?.text !== undefined;
      if (!partial && !nestedChanged) return part;
      changed = true;
      return { ...part,
        ...(nestedChanged ? { messages } : {}),
        ...(partial ? { result: stream.text, isPreliminary: true } : {}),
      };
    });
    const value = changed ? { ...message, content } as T : message;
    this.cache.set(message, { revision: this.revision, value });
    return value;
  }

  start(): void {
    if (this.stops.length > 0) return;
    const subscriber: AgentSubscriber = {
      onRunInitialized: ({ input }) => {
        this.runId = input.runId;
        this.active.clear();
        this.blocked.clear();
        this.walk((message, part) => {
          if (message.status.type === 'complete' || message.status.type === 'incomplete' || part.result !== undefined) {
            this.blocked.add(part.toolCallId);
          }
        });
      },
      onEvent: ({ event, input }) => {
        if (this.runId !== input.runId || !this.thread.getState().isRunning) return;
        if (event.type === 'TOOL_CALL_START') {
          const id = event.toolCallId;
          if (typeof id !== 'string' || typeof event.subagentRunId !== 'string' && event.subagentRunId !== undefined) return;
          if (!this.blocked.has(id) && !this.active.has(id)) {
            this.active.set(id, { scope: event.subagentRunId, ended: false });
            this.sync();
          }
        } else if (event.type === 'TOOL_CALL_RESULT') {
          if (typeof event.toolCallId !== 'string') return;
          const stream = this.active.get(event.toolCallId);
          if (stream && stream.scope === event.subagentRunId) stream.ended = true;
        } else if (event.type === 'CUSTOM' && event.name === 'TOOL_CALL_STREAM_RESULT') {
          const value: unknown = event.value;
          if (typeof value !== 'object' || value === null || !('toolCallId' in value) ||
            !('content' in value) || typeof value.toolCallId !== 'string' || typeof value.content !== 'string') return;
          const stream = this.active.get(value.toolCallId);
          if (!stream || stream.ended || stream.scope !== event.subagentRunId || value.content.length === 0) return;
          stream.text = (stream.text ?? '') + value.content;
          this.sync();
          this.notify();
        } else if (event.type === 'MESSAGES_SNAPSHOT') {
          // History/snapshot content is authoritative; do not replay transient chunks over it.
          for (const stream of this.active.values()) delete stream.text;
          this.bound = new WeakMap();
          this.notify();
        }
      },
      onRunFinalized: ({ input }) => {
        if (this.runId !== input.runId) return;
        this.runId = undefined;
        this.active.clear();
      },
    };
    const subscription = this.agent.subscribe(subscriber);
    this.stops = [() => subscription.unsubscribe(), this.thread.subscribe(() => this.sync())];
  }

  stop(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
    this.runId = undefined;
    this.active.clear();
  }

  private walk(visit: (message: ThreadAssistantMessage, part: ToolCallMessagePart,
    scope: string | undefined) => void): void {
    const walk = (messages: readonly ThreadMessage[], scope?: string): void => {
      for (const message of messages) {
        if (message.role !== 'assistant') continue;
        for (const part of message.content) {
          if (part.type !== 'tool-call') continue;
          visit(message, part, scope);
          for (const child of part.messages ?? []) walk([child], child.id);
        }
      }
    };
    walk(this.thread.getState().messages);
  }

  private sync(): void {
    let changed = false;
    this.walk((message, part, scope) => {
      const stream = this.active.get(part.toolCallId);
      if (!stream || stream.scope !== scope) return;
      if (part.result !== undefined) stream.ended = true;
      let streams = this.bound.get(message.createdAt);
      if (!streams) { streams = new Map(); this.bound.set(message.createdAt, streams); }
      if (streams.get(part.toolCallId) === stream) return;
      streams.set(part.toolCallId, stream);
      if (stream.text !== undefined) changed = true;
    });
    if (changed) this.notify();
  }

  private notify(): void { this.revision++; for (const listener of this.listeners) listener(); }
}
