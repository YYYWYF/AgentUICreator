import type { AgentTransport, AgentTransportSnapshot } from "./agent-transport";

export abstract class ObservableAgentTransport implements AgentTransport {
  abstract readonly mode: string;

  protected snapshot: AgentTransportSnapshot;
  private readonly listeners = new Set<() => void>();

  protected constructor(snapshot: AgentTransportSnapshot) {
    this.snapshot = snapshot;
  }

  getSnapshot = (): AgentTransportSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  protected publish(snapshot: AgentTransportSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  dispose(): void {
    this.listeners.clear();
    this.abort();
  }

  abstract sendMessage(input: string): Promise<void>;
  abstract startNewConversation(): Promise<void>;
  abstract abort(): void;
}
