import { HttpAgent, type AgentSubscriber } from "@ag-ui/client";
import type { Message, State } from "@ag-ui/core";

export type AgentRuntimeMode = "http" | "mock";

export interface AgentConnectionConfig {
  endpoint: string;
}

export interface AgentRuntimeSnapshot {
  messages: Message[];
  state: unknown;
  isRunning: boolean;
  error: Error | undefined;
}

export interface AgentRuntimeTransport {
  readonly mode: AgentRuntimeMode;
  getSnapshot(): AgentRuntimeSnapshot;
  subscribe(listener: () => void): () => void;
  sendMessage(input: string): Promise<void>;
  abort(): void;
}

interface AgentClient {
  readonly messages: Message[];
  readonly state: State;
  readonly isRunning: boolean;
  subscribe(subscriber: AgentSubscriber): { unsubscribe(): void };
  addMessage(message: Message): void;
  runAgent(): Promise<unknown>;
  abortRun(): void;
}

type AgentClientFactory = (config: AgentConnectionConfig) => AgentClient;

interface MockAgentRuntimeConfig {
  initialMessages?: Message[] | undefined;
  initialState?: unknown;
}

export interface CreateAgentRuntimeOptions {
  endpoint?: string | undefined;
}

function createMessageId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

abstract class ObservableAgentRuntime implements AgentRuntimeTransport {
  abstract readonly mode: AgentRuntimeMode;

  protected snapshot: AgentRuntimeSnapshot;
  private readonly listeners = new Set<() => void>();

  protected constructor(snapshot: AgentRuntimeSnapshot) {
    this.snapshot = snapshot;
  }

  getSnapshot = (): AgentRuntimeSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  protected publish(snapshot: AgentRuntimeSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  abstract sendMessage(input: string): Promise<void>;
  abstract abort(): void;
}

export class HttpAgentRuntime extends ObservableAgentRuntime {
  readonly mode = "http" as const;

  private readonly agent: AgentClient;

  constructor(
    config: AgentConnectionConfig,
    createClient: AgentClientFactory = ({ endpoint }) =>
      new HttpAgent({ url: endpoint }),
  ) {
    const agent = createClient(config);
    super({
      messages: [...agent.messages],
      state: agent.state,
      isRunning: agent.isRunning,
      error: undefined,
    });
    this.agent = agent;

    this.agent.subscribe({
      onMessagesChanged: () => this.syncFromAgent(),
      onStateChanged: () => this.syncFromAgent(),
      onRunInitialized: () => this.syncFromAgent({ error: undefined }),
      onRunFailed: ({ error }) => this.syncFromAgent({ error }),
      onRunFinalized: () => this.syncFromAgent(),
    });
  }

  async sendMessage(input: string): Promise<void> {
    const message = input.trim();

    if (message.length === 0) {
      return;
    }

    if (this.snapshot.isRunning || this.agent.isRunning) {
      throw new Error("智能体运行时正在处理另一条消息。");
    }

    this.agent.addMessage({
      id: createMessageId("user"),
      role: "user",
      content: message,
    });

    try {
      const run = this.agent.runAgent();
      this.syncFromAgent({ error: undefined, isRunning: true });
      await run;
    } catch (error) {
      const runError = toError(error);
      this.syncFromAgent({ error: runError, isRunning: false });
      throw runError;
    } finally {
      this.syncFromAgent({ isRunning: false });
    }
  }

  abort(): void {
    this.agent.abortRun();
  }

  private syncFromAgent(
    overrides: Partial<Pick<AgentRuntimeSnapshot, "error" | "isRunning">> = {},
  ): void {
    this.publish({
      messages: [...this.agent.messages],
      state: this.agent.state,
      isRunning: overrides.isRunning ?? this.agent.isRunning,
      error: Object.hasOwn(overrides, "error")
        ? overrides.error
        : this.snapshot.error,
    });
  }
}

export class MockAgentRuntime extends ObservableAgentRuntime {
  readonly mode = "mock" as const;

  constructor(config: MockAgentRuntimeConfig = {}) {
    super({
      messages: [...(config.initialMessages ?? [])],
      state: config.initialState ?? {},
      isRunning: false,
      error: undefined,
    });
  }

  async sendMessage(input: string): Promise<void> {
    const message = input.trim();

    if (message.length === 0) {
      return;
    }

    if (this.snapshot.isRunning) {
      throw new Error("智能体运行时正在处理另一条消息。");
    }

    this.publish({
      ...this.snapshot,
      messages: [
        ...this.snapshot.messages,
        {
          id: createMessageId("mock-user"),
          role: "user",
          content: message,
        },
      ],
      isRunning: true,
      error: undefined,
    });

    await Promise.resolve();

    this.publish({
      ...this.snapshot,
      messages: [
        ...this.snapshot.messages,
        {
          id: createMessageId("mock-assistant"),
          role: "assistant",
          content: `Mock AG-UI received: ${message}`,
        },
      ],
      isRunning: false,
    });
  }

  abort(): void {
    if (!this.snapshot.isRunning) {
      return;
    }

    this.publish({ ...this.snapshot, isRunning: false });
  }
}

export function createAgentRuntime(
  options: CreateAgentRuntimeOptions,
): AgentRuntimeTransport {
  const endpoint = options.endpoint?.trim();

  if (endpoint !== undefined && endpoint.length > 0) {
    return new HttpAgentRuntime({ endpoint });
  }

  throw new Error("必须配置智能体运行时端点。");
}
