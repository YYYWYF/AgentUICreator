import type { AgentTransport, AgentTransportSnapshot } from "./agent-transport";

export type AgentRuntimeSnapshot = AgentTransportSnapshot;

export interface AgentRuntime {
  readonly mode: string;
  getSnapshot(): AgentRuntimeSnapshot;
  subscribe(listener: () => void): () => void;
  sendMessage(input: string): Promise<void>;
  startNewConversation(): Promise<void>;
  abort(): void;
  dispose(): void;
}

export interface CreateAgentRuntimeOptions {
  transport: AgentTransport;
}

/** The runtime owns one injected transport and exposes only frontend semantics. */
export function createAgentRuntime({
  transport,
}: CreateAgentRuntimeOptions): AgentRuntime {
  return {
    get mode() {
      return transport.mode;
    },
    // Keep method receivers and the transport's cached snapshot identity intact.
    getSnapshot: () => transport.getSnapshot(),
    subscribe: (listener) => transport.subscribe(listener),
    sendMessage: (input) => transport.sendMessage(input),
    startNewConversation: () => transport.startNewConversation(),
    abort: () => transport.abort(),
    dispose: () => transport.dispose?.(),
  };
}
