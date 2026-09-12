import type { ThreadMessage } from "@assistant-ui/react";

export interface AssistantUiLoadedThread<TState = unknown> {
  messages: readonly ThreadMessage[];
  state?: TState | undefined;
}

export interface AssistantUiThreadListItem<
  TStatus extends "regular" | "archived",
> {
  id: string;
  status: TStatus;
  title?: string | undefined;
  custom?: Record<string, unknown> | undefined;
}

export interface AssistantUiThreadListSnapshot {
  isLoading?: boolean | undefined;
  threads: readonly AssistantUiThreadListItem<"regular">[];
  archivedThreads: readonly AssistantUiThreadListItem<"archived">[];
}

/** AgentUICreator-owned identity seam. Persistence is deliberately optional. */
export interface AssistantUiThreadBinding<TState = unknown> {
  getThreadId(): string;
  subscribe(listener: () => void): () => void;
  createNewThread(): Promise<string>;
  getThreadListSnapshot?(): AssistantUiThreadListSnapshot;
  selectThread?(
    threadId: string,
  ): Promise<AssistantUiLoadedThread<TState>>;
}
