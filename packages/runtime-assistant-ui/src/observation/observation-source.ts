import type { ThreadRuntime, ToolCallMessagePart } from "@assistant-ui/react";

import type {
  ConversationObservationSnapshot,
  ConversationObservationSource,
  ConversationToolCallObservation,
} from "./types.js";

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function projectTool(
  part: ToolCallMessagePart,
  messageId: string,
  isRunning: boolean,
): ConversationToolCallObservation {
  const state = part.result === undefined
    ? part.interrupt === undefined
      ? isRunning ? "running" : "preparing"
      : "interrupted"
    : part.isError ? "error" : "completed";
  return {
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    state,
    args: structuredClone(part.args),
    messageId,
    ...(part.result === undefined ? {} : { result: structuredClone(part.result) }),
    ...(part.isError ? { error: stringify(part.result) } : {}),
  };
}

export class AssistantUiObservationSource
  implements ConversationObservationSource {
  private readonly listeners = new Set<() => void>();
  private unsubscribeFromThread: (() => void) | undefined;
  private snapshot: ConversationObservationSnapshot;

  constructor(
    private readonly thread: ThreadRuntime,
    private readonly getThreadId: () => string,
  ) {
    this.snapshot = this.projectSnapshot();
  }

  start(): void {
    if (this.unsubscribeFromThread !== undefined) return;
    this.unsubscribeFromThread = this.thread.subscribe(() => this.sync());
  }

  getSnapshot(): ConversationObservationSnapshot {
    return this.snapshot;
  }

  sync(): void {
    this.snapshot = this.projectSnapshot();
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  stop(): void {
    this.unsubscribeFromThread?.();
    this.unsubscribeFromThread = undefined;
  }

  dispose(): void {
    this.stop();
    this.listeners.clear();
  }

  private projectSnapshot(): ConversationObservationSnapshot {
    const state = this.thread.getState();
    return {
      schemaVersion: 1,
      threadId: this.getThreadId(),
      isRunning: state.isRunning,
      toolCalls: state.messages.flatMap((message) => {
        if (message.role !== "assistant") return [];
        return message.content
          .filter((part): part is ToolCallMessagePart => part.type === "tool-call")
          .map((part) => projectTool(part, message.id, state.isRunning));
      }),
    };
  }
}
