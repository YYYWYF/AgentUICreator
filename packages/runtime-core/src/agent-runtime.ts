import type { AgentUserInput } from "./agent-input.js";
import type {
  AgentTransport,
  AgentTransportSnapshot,
} from "./agent-transport.js";

export type AgentRuntimeSnapshot<TState = unknown> =
  AgentTransportSnapshot<TState>;

export interface AgentRuntime<TState = unknown> {
  readonly mode: string;
  getSnapshot(): AgentRuntimeSnapshot<TState>;
  subscribe(listener: () => void): () => void;
  sendMessage(input: string | AgentUserInput): Promise<void>;
  startNewConversation(): Promise<void>;
  abort(): void;
  dispose(): void;
}

export interface CreateAgentRuntimeOptions<TState = unknown> {
  transport: AgentTransport<TState>;
}

/** The runtime owns one injected transport and exposes only frontend semantics. */
export function createAgentRuntime<TState = unknown>({
  transport,
}: CreateAgentRuntimeOptions<TState>): AgentRuntime<TState> {
  return {
    get mode() {
      return transport.mode;
    },
    // Keep method receivers and the transport's cached snapshot identity intact.
    getSnapshot: () => transport.getSnapshot(),
    subscribe: (listener) => transport.subscribe(listener),
    sendMessage: (input) =>
      transport.sendMessage(
        typeof input === "string" ? { content: input } : input,
      ),
    startNewConversation: () => transport.startNewConversation(),
    abort: () => transport.abort(),
    dispose: () => transport.dispose?.(),
  };
}
