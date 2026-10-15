import type { AgentUserInput } from "./agent-input.js";
import type { AgentInterruptResponse } from "./agent-interrupt.js";
import type {
  AgentApplicationEvent,
  AgentApplicationEventListener,
} from "./agent-application-event.js";
import type {
  AgentTransport,
  AgentTransportSnapshot,
} from "./agent-transport.js";

export abstract class ObservableAgentTransport<TState = unknown>
  implements AgentTransport<TState> {
  abstract readonly mode: string;

  protected snapshot: AgentTransportSnapshot<TState>;
  private readonly listeners = new Set<() => void>();
  private readonly applicationEventListeners =
    new Set<AgentApplicationEventListener>();

  protected constructor(snapshot: AgentTransportSnapshot<TState>) {
    this.snapshot = snapshot;
  }

  getSnapshot = (): AgentTransportSnapshot<TState> => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  subscribeApplicationEvents = (
    listener: AgentApplicationEventListener,
  ): (() => void) => {
    this.applicationEventListeners.add(listener);
    return () => {
      this.applicationEventListeners.delete(listener);
    };
  };

  protected publish(snapshot: AgentTransportSnapshot<TState>): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  protected emitApplicationEvent(event: AgentApplicationEvent): void {
    this.applicationEventListeners.forEach((listener) => listener(event));
  }

  dispose(): void {
    this.listeners.clear();
    this.applicationEventListeners.clear();
    this.abort();
  }

  abstract sendMessage(input: AgentUserInput): Promise<void>;
  abstract resumeInterrupts(
    responses: AgentInterruptResponse[],
  ): Promise<void>;
  abstract startNewConversation(): Promise<void>;
  abstract abort(): void;
}
