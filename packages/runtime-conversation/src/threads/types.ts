export interface ConversationMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: readonly Record<string, unknown>[];
  readonly [key: string]: unknown;
}

export interface ConversationLoadedThread<TState = unknown> {
  messages: readonly ConversationMessage[];
  state?: TState | undefined;
  /** An existing server run paired with this exact history snapshot. */
  resume?: ConversationRunResume | undefined;
  /** Capability discovery failed after history was loaded; report without starting a run. */
  resumeDiscoveryError?: Error | undefined;
}

/** A snapshot of the resumed assistant segment. Content excludes parts already in history. */
export interface ConversationAssistantRunUpdate {
  readonly content?: ConversationMessage["content"] | undefined;
  readonly status?:
    | { readonly type: "running" }
    | { readonly type: "requires-action"; readonly reason: "tool-calls" | "interrupt" }
    | { readonly type: "complete"; readonly reason: "stop" | "unknown" }
    | { readonly type: "incomplete"; readonly reason: "cancelled" | "tool-calls" | "length" | "content-filter" | "other" | "error"; readonly error?: unknown }
    | undefined;
  /** Conversation metadata, including state, data, annotations, steps and custom fields. */
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

/** Optional capability owned by the loaded thread, not by the active selection. */
export interface ConversationRunResume {
  stream(signal: AbortSignal): AsyncGenerator<ConversationAssistantRunUpdate, void, unknown>;
}

export interface ConversationThreadListItem<
  TStatus extends "regular" | "archived",
> {
  id: string;
  status: TStatus;
  title?: string | undefined;
  custom?: Record<string, unknown> | undefined;
}

export interface ConversationThreadListSnapshot {
  isLoading?: boolean | undefined;
  threads: readonly ConversationThreadListItem<"regular">[];
  archivedThreads: readonly ConversationThreadListItem<"archived">[];
}

/** AgentUICreator-owned identity seam. Persistence is deliberately optional. */
export interface ConversationThreadBinding<TState = unknown> {
  getThreadId(): string;
  getIsDisabled?(): boolean;
  getThreadIsDisabled?(threadId: string): boolean;
  /** Load once per upstream-owned runtime, independently of navigation. */
  loadThread?(threadId: string): Promise<ConversationLoadedThread<TState>>;
  /** Synchronize business selection without loading or replacing runtime state. */
  activateThread?(threadId: string): void;
  reserveThread?(threadId: string): void;
  initializeThread?(threadId: string): Promise<string>;
  getThreadMetadata?(threadId: string): Promise<ConversationThreadListItem<"regular">>;
  deleteThread?(threadId: string): Promise<void>;
  subscribe(listener: () => void): () => void;
  createNewThread(): Promise<string>;
  getThreadListSnapshot?(): ConversationThreadListSnapshot;
  selectThread?(
    threadId: string,
  ): Promise<ConversationLoadedThread<TState>>;
}
