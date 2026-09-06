import type { AgentConversation } from "./agent-conversation.js";
import type { AgentApplicationEventListener } from "./agent-application-event.js";
import type { AgentExecution } from "./agent-execution.js";
import type {
  AgentInterrupt,
  AgentInterruptResponse,
} from "./agent-interrupt.js";
import type { AgentUserInput } from "./agent-input.js";
import type { AgentMessage } from "./agent-message.js";
import type { AgentRunState } from "./agent-run.js";

export interface AgentTransportSnapshot<TState = unknown> {
  conversation: AgentConversation;
  messages: AgentMessage[];
  state: TState;
  run: AgentRunState;
  /** Live executions for the current fresh user turn and its resume runs. */
  executions: AgentExecution[];
  /** Unresolved interrupts for the current conversation. */
  interrupts: AgentInterrupt[];
}

export interface AgentTransport<TState = unknown> {
  readonly mode: string;
  getSnapshot(): AgentTransportSnapshot<TState>;
  subscribe(listener: () => void): () => void;
  subscribeApplicationEvents(listener: AgentApplicationEventListener): () => void;
  sendMessage(input: AgentUserInput): Promise<void>;
  resumeInterrupts(responses: AgentInterruptResponse[]): Promise<void>;
  startNewConversation(): Promise<void>;
  abort(): void;
  dispose?(): void;
}
