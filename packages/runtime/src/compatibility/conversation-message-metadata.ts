import type { AbstractAgent, AgentSubscriber } from '@ag-ui/client';

export type ConversationMessageMetadata = Readonly<Record<string, unknown>>;
export interface ConversationMessageMetadataTarget {
  readonly id: string;
  readonly createdAt: Date;
  readonly metadata: { readonly custom?: ConversationMessageMetadata };
}
const EMPTY_METADATA: ConversationMessageMetadata = Object.freeze({});

function record(value: unknown): ConversationMessageMetadata | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as ConversationMessageMetadata : undefined;
}

export function readNativeMessageMetadata(message: ConversationMessageMetadataTarget): ConversationMessageMetadata {
  return record(message.metadata.custom) ?? EMPTY_METADATA;
}

function wireId(message: ConversationMessageMetadataTarget): string {
  const id = record(readNativeMessageMetadata(message).agui)?.messageId;
  return typeof id === 'string' ? id : message.id;
}

interface Supplement {
  metadata: ConversationMessageMetadata;
  createdAt: Date;
  native: ConversationMessageMetadata;
  merged: ConversationMessageMetadata;
}

type MetadataThread = {
  getState(): {
    readonly messages: readonly (ConversationMessageMetadataTarget & {
      readonly role: string;
      readonly status?: { readonly type: string };
    })[];
    readonly isRunning: boolean;
  };
  subscribe(listener: () => void): () => void;
};

/** Application metadata only. Native messages, branches and run state remain upstream-owned. */
export class ConversationMessageMetadataStore {
  private readonly listeners = new Set<() => void>();
  private readonly supplements = new Map<string, Supplement>();
  private readonly pending = new Map<string, ConversationMessageMetadata>();
  private readonly blocked = new Set<string>();
  private readonly snapshotIds = new Set<string>();
  private runId: string | undefined;
  private revision = 0;
  private stops: Array<() => void> = [];

  constructor(private readonly agent: Pick<AbstractAgent, 'subscribe'>,
    private readonly thread: MetadataThread) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getRevision = (): number => this.revision;

  read(message: ConversationMessageMetadataTarget): ConversationMessageMetadata {
    const native = readNativeMessageMetadata(message);
    const current = this.thread.getState().messages.find(item => item.id === message.id);
    // A nested readonly transcript may reuse an id. Match the native root message itself.
    if (!current || current.createdAt !== message.createdAt || current.metadata !== message.metadata) return native;
    const value = this.supplements.get(message.id);
    return value?.createdAt === message.createdAt && value.native === native ? value.merged : native;
  }

  start(): void {
    if (this.stops.length > 0) return;
    const subscriber: AgentSubscriber = {
      onRunInitialized: ({ input }) => {
        this.runId = input.runId;
        this.pending.clear();
        this.blocked.clear();
        this.snapshotIds.clear();
        for (const message of this.thread.getState().messages) {
          if (message.role !== 'assistant' || (message.status?.type !== 'running' && message.status?.type !== 'requires-action')) {
            this.blocked.add(wireId(message));
          }
        }
      },
      onEvent: ({ event, input }) => {
        if (this.runId !== input.runId || !this.thread.getState().isRunning) return;
        if (event.type === 'MESSAGES_SNAPSHOT') {
          // Snapshot messages already carry authoritative native metadata through the converter.
          const snapshot = event as { messages?: readonly { id: string; subagentRunId?: string }[] };
          for (const message of snapshot.messages ?? []) {
            if (message.subagentRunId !== undefined) continue;
            this.pending.delete(message.id);
            this.snapshotIds.add(message.id);
          }
          return;
        }
        if (event.type !== 'TEXT_MESSAGE_START' && event.type !== 'TEXT_MESSAGE_CONTENT' && event.type !== 'TEXT_MESSAGE_END') return;
        const text = event as { messageId?: string; subagentRunId?: string; metadata?: unknown };
        if (text.subagentRunId !== undefined || !text.messageId || this.blocked.has(text.messageId)) return;
        const metadata = record(text.metadata);
        if (!metadata || Object.keys(metadata).length === 0) return;
        const current = this.thread.getState().messages.find(message => wireId(message) === text.messageId);
        const supplement = current && this.supplements.get(current.id);
        const existing = this.pending.get(text.messageId) ??
          (supplement?.createdAt === current?.createdAt ? supplement?.metadata : undefined);
        const next = { ...existing, ...structuredClone(metadata) };
        if (existing && Object.keys(next).every(key => Object.is(existing[key], next[key]))) return;
        this.pending.set(text.messageId, next);
        this.sync();
      },
      onRunFinalized: ({ input }) => {
        if (this.runId !== input.runId) return;
        this.sync();
        this.runId = undefined;
        this.pending.clear();
        this.snapshotIds.clear();
      },
    };
    const subscription = this.agent.subscribe(subscriber);
    this.stops = [() => subscription.unsubscribe(), this.thread.subscribe(() => this.sync())];
    this.sync();
  }

  stop(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
    this.runId = undefined;
    this.pending.clear();
    this.snapshotIds.clear();
  }

  private sync(): void {
    let changed = false;
    for (const message of this.thread.getState().messages) {
      if (message.role !== 'assistant') continue;
      const previous = this.supplements.get(message.id);
      const sameMessage = previous?.createdAt === message.createdAt;
      const native = readNativeMessageMetadata(message);
      // Let upstream finish importing before withdrawing the old supplement, avoiding a blank header frame.
      if (this.snapshotIds.has(wireId(message)) && (!sameMessage || previous?.native !== native)) {
        this.supplements.delete(message.id);
        this.snapshotIds.delete(wireId(message));
        changed = true;
        continue;
      }
      const pending = this.pending.get(wireId(message));
      const metadata = pending ?? (sameMessage ? previous.metadata : undefined);
      if (!metadata) continue;
      if (sameMessage && previous.metadata === metadata && previous.native === native) continue;
      this.supplements.set(message.id, {
        metadata, createdAt: message.createdAt, native, merged: { ...native, ...metadata },
      });
      changed = true;
    }
    if (changed) this.notify();
  }

  private notify(): void { this.revision++; for (const listener of this.listeners) listener(); }
}
