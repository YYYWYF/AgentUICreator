import type { AgentUserInput } from "./agent-input.js";
import type { AgentInterruptResponse } from "./agent-interrupt.js";
import type { AgentApplicationEventListener } from "./agent-application-event.js";
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
  subscribeApplicationEvents(listener: AgentApplicationEventListener): () => void;
  sendMessage(input: string | AgentUserInput): Promise<void>;
  resumeInterrupts(responses: AgentInterruptResponse[]): Promise<void>;
  startNewConversation(): Promise<void>;
  abort(): void;
  dispose(): void;
}

export interface CreateAgentRuntimeOptions<TState = unknown> {
  transport: AgentTransport<TState>;
}

function validateInterruptResponses<TState>(
  snapshot: AgentTransportSnapshot<TState>,
  responses: AgentInterruptResponse[],
): void {
  if (snapshot.interrupts.length === 0) {
    throw new Error("No pending interrupts");
  }
  if (snapshot.run.status === "running") {
    throw new Error("Cannot resume interrupts while the agent is running");
  }

  const responseIds = responses.map((response) => response.interruptId);
  const uniqueResponseIds = new Set(responseIds);
  if (uniqueResponseIds.size !== responseIds.length) {
    throw new Error("Interrupt responses must not contain duplicate IDs");
  }

  const pendingIds = new Set(snapshot.interrupts.map((interrupt) => interrupt.id));
  const unknownId = responseIds.find((id) => !pendingIds.has(id));
  if (unknownId !== undefined) {
    throw new Error(`Unknown interrupt response ID: ${unknownId}`);
  }

  const missingId = snapshot.interrupts.find(
    (interrupt) => !uniqueResponseIds.has(interrupt.id),
  )?.id;
  if (missingId !== undefined) {
    throw new Error(`Missing response for pending interrupt: ${missingId}`);
  }
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
    subscribeApplicationEvents: (listener) =>
      transport.subscribeApplicationEvents(listener),
    sendMessage: (input) => {
      if (transport.getSnapshot().interrupts.length > 0) {
        return Promise.reject(new Error(
          "当前会话正在等待用户响应，请先处理 pending interrupts。",
        ));
      }
      return transport.sendMessage(
        typeof input === "string" ? { content: input } : input,
      );
    },
    resumeInterrupts: async (responses) => {
      validateInterruptResponses(transport.getSnapshot(), responses);
      await transport.resumeInterrupts(responses);
    },
    startNewConversation: () => transport.startNewConversation(),
    abort: () => transport.abort(),
    dispose: () => transport.dispose?.(),
  };
}
