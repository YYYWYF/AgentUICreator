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
  private readonly runMessages = new Map<string, Date>();
  private readonly endedTextIds = new Set<string>();
  private speaker: { readonly value: unknown } | undefined;
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
        this.runMessages.clear();
        this.endedTextIds.clear();
        this.speaker = undefined;
        for (const message of this.thread.getState().messages) {
          if (message.role !== 'assistant' || (message.status?.type !== 'running' && message.status?.type !== 'requires-action')) {
            this.blocked.add(wireId(message));
          }
        }
      },
      onEvent: ({ event, input }) => {
        if (this.runId !== input.runId || !this.thread.getState().isRunning) return;
        const source = event as { messageId?: string; subagentRunId?: string; metadata?: unknown };
        if (source.subagentRunId !== undefined) return;
        const textEvent = event.type === 'TEXT_MESSAGE_START' || event.type === 'TEXT_MESSAGE_CONTENT' ||
          event.type === 'TEXT_MESSAGE_END' || event.type === 'TEXT_MESSAGE_CHUNK';
        if (textEvent && source.messageId && this.blocked.has(source.messageId)) return;
        const metadata = record(source.metadata);
        // Application identity is run-scoped. Other metadata keeps its protocol destination.
        if (metadata && Object.hasOwn(metadata, 'speaker')) {
          this.speaker = { value: structuredClone(metadata.speaker) };
          if ((!textEvent || !source.messageId) && event.type !== 'MESSAGES_SNAPSHOT') {
            const current = [...this.thread.getState().messages].reverse().find(message =>
              message.role === 'assistant' && !this.blocked.has(wireId(message)));
            if (current && ((!this.endedTextIds.has(wireId(current)) &&
              (current.status?.type === 'running' || current.status?.type === 'requires-action')) ||
              !Object.hasOwn(this.read(current), 'speaker'))) {
              this.mergePending(current, { speaker: this.speaker.value });
            }
          }
        }
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
        if (textEvent && source.messageId && metadata && Object.keys(metadata).length > 0) {
          const current = this.thread.getState().messages.find(message => wireId(message) === source.messageId);
          this.mergePending(current ?? source.messageId, structuredClone(metadata));
        }
        if (event.type === 'TEXT_MESSAGE_END' && source.messageId) this.endedTextIds.add(source.messageId);
        this.sync();
      },
      onRunFinalized: ({ input }) => {
        if (this.runId !== input.runId) return;
        this.sync();
        this.runId = undefined;
        this.pending.clear();
        this.snapshotIds.clear();
        this.runMessages.clear();
        this.endedTextIds.clear();
        this.speaker = undefined;
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
    this.runMessages.clear();
    this.endedTextIds.clear();
    this.speaker = undefined;
  }

  private mergePending(message: ConversationMessageMetadataTarget | string, metadata: ConversationMessageMetadata): void {
    const id = typeof message === 'string' ? message : wireId(message);
    const supplement = typeof message === 'string' ? undefined : this.supplements.get(message.id);
    const existing = this.pending.get(id) ??
      (typeof message !== 'string' && supplement?.createdAt === message.createdAt ? supplement.metadata : undefined);
    this.pending.set(id, { ...existing, ...metadata });
  }

  private sync(): void {
    let changed = false;
    const thread = this.thread.getState();
    for (const message of thread.messages) {
      if (message.role !== 'assistant') continue;
      const previous = this.supplements.get(message.id);
      const sameMessage = previous?.createdAt === message.createdAt;
      const native = readNativeMessageMetadata(message);
      const newRunMessage = this.runId !== undefined && thread.isRunning && !this.blocked.has(wireId(message)) &&
        this.runMessages.get(message.id) !== message.createdAt;
      if (newRunMessage) this.runMessages.set(message.id, message.createdAt);
      // Let upstream finish importing before withdrawing the old supplement, avoiding a blank header frame.
      if (this.snapshotIds.has(wireId(message)) && (!sameMessage || previous?.native !== native)) {
        this.supplements.delete(message.id);
        this.snapshotIds.delete(wireId(message));
        changed = true;
        continue;
      }
      const pending = this.pending.get(wireId(message));
      let metadata = pending ?? (sameMessage ? previous.metadata : undefined);
      if (newRunMessage && this.speaker && !Object.hasOwn(native, 'speaker') && !Object.hasOwn(metadata ?? {}, 'speaker')) {
        metadata = { ...metadata, speaker: this.speaker.value };
        this.pending.set(wireId(message), metadata);
      }
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
