import type { AgentConversation } from "./agent-conversation.js";
import type { AgentUserInput } from "./agent-input.js";
import type { AgentMessage } from "./agent-message.js";
import type { AgentRunState } from "./agent-run.js";

export interface AgentTransportSnapshot<TState = unknown> {
  conversation: AgentConversation;
  messages: AgentMessage[];
  state: TState;
  run: AgentRunState;
}

export interface AgentTransport<TState = unknown> {
  readonly mode: string;
  getSnapshot(): AgentTransportSnapshot<TState>;
  subscribe(listener: () => void): () => void;
  sendMessage(input: AgentUserInput): Promise<void>;
  startNewConversation(): Promise<void>;
  abort(): void;
  dispose?(): void;
}
