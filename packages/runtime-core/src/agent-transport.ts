import type { AgentMessage } from "./agent-message.js";

export interface AgentTransportSnapshot {
  messages: AgentMessage[];
  state: unknown;
  isRunning: boolean;
  error: Error | undefined;
}

export interface AgentTransport {
  readonly mode: string;
  getSnapshot(): AgentTransportSnapshot;
  subscribe(listener: () => void): () => void;
  sendMessage(input: string): Promise<void>;
  startNewConversation(): Promise<void>;
  abort(): void;
  dispose?(): void;
}
