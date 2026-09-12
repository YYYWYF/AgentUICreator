import type { ThreadMessage } from "@assistant-ui/react";

export interface AssistantUiLoadedThread<TState = unknown> {
  messages: readonly ThreadMessage[];
  state?: TState | undefined;
}

/** AgentUICreator-owned identity seam. Persistence is deliberately optional. */
export interface AssistantUiThreadBinding<TState = unknown> {
  getThreadId(): string;
  subscribe(listener: () => void): () => void;
  createNewThread(): Promise<string>;
  selectThread?(
    threadId: string,
  ): Promise<AssistantUiLoadedThread<TState>>;
}
