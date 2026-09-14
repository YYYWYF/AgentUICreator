export interface ConversationMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: readonly Record<string, unknown>[];
  readonly [key: string]: unknown;
}

export interface ConversationLoadedThread<TState = unknown> {
  messages: readonly ConversationMessage[];
  state?: TState | undefined;
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
  subscribe(listener: () => void): () => void;
  createNewThread(): Promise<string>;
  getThreadListSnapshot?(): ConversationThreadListSnapshot;
  selectThread?(
    threadId: string,
  ): Promise<ConversationLoadedThread<TState>>;
}
