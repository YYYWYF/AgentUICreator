export type ConversationToolCallState =
  | "preparing"
  | "running"
  | "completed"
  | "error"
  | "interrupted";

export interface ConversationToolCallObservation {
  toolCallId: string;
  toolName: string;
  state: ConversationToolCallState;
  args?: unknown;
  result?: unknown;
  error?: string;
  messageId?: string;
}

export interface ConversationObservationSnapshot {
  threadId: string;
  isRunning: boolean;
  toolCalls: ConversationToolCallObservation[];
}

export interface ConversationObservationSource {
  getSnapshot(): ConversationObservationSnapshot;
  subscribe(listener: () => void): () => void;
}
