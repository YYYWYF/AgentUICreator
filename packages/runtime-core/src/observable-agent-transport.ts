import type { AgentUserInput } from "./agent-input.js";
import type {
  AgentTransport,
  AgentTransportSnapshot,
} from "./agent-transport.js";

export abstract class ObservableAgentTransport<TState = unknown>
  implements AgentTransport<TState> {
  abstract readonly mode: string;

  protected snapshot: AgentTransportSnapshot<TState>;
  private readonly listeners = new Set<() => void>();

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

  protected publish(snapshot: AgentTransportSnapshot<TState>): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  dispose(): void {
    this.listeners.clear();
    this.abort();
  }

  abstract sendMessage(input: AgentUserInput): Promise<void>;
  abstract startNewConversation(): Promise<void>;
  abstract abort(): void;
}
