import { HttpAgent, type AgentSubscriber } from "@ag-ui/client";
import type { Message, State } from "@ag-ui/core";

import type { AgentTransportSnapshot } from "../core/agent-transport";
import { ObservableAgentTransport } from "../core/observable-agent-transport";
import { mapAgUiMessage } from "./message-mapper";

export interface AgUiTransportConfig {
  endpoint: string;
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

interface AgentClientConfig extends AgUiTransportConfig {
  threadId: string;
}

type AgentClientFactory = (config: AgentClientConfig) => AgentClient;

function createMessageId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export class AgUiTransport extends ObservableAgentTransport {
  readonly mode = "http" as const;

  private agent: AgentClient;
  private readonly config: AgUiTransportConfig;
  private readonly createClient: AgentClientFactory;
  private unsubscribeFromAgent: (() => void) | undefined;
  private disposed = false;

  constructor(
    config: AgUiTransportConfig,
    createClient: AgentClientFactory = ({ endpoint, threadId }) =>
      new HttpAgent({ url: endpoint, threadId }),
  ) {
    const agent = createClient({ ...config, threadId: crypto.randomUUID() });
    super({
      messages: agent.messages.map(mapAgUiMessage),
      state: agent.state,
      isRunning: agent.isRunning,
      error: undefined,
    });
    this.config = config;
    this.createClient = createClient;
    this.agent = agent;
    this.unsubscribeFromAgent = this.subscribeToAgent(agent);
  }

  private subscribeToAgent(agent: AgentClient): () => void {
    const subscription = agent.subscribe({
      onMessagesChanged: () => this.syncFromAgent(agent),
      onStateChanged: () => this.syncFromAgent(agent),
      onRunInitialized: () =>
        this.syncFromAgent(agent, { error: undefined }),
      onRunFailed: ({ error }) => this.syncFromAgent(agent, { error }),
      onRunFinalized: () => this.syncFromAgent(agent),
    });

    return () => subscription.unsubscribe();
  }

  async sendMessage(input: string): Promise<void> {
    const message = input.trim();

    if (message.length === 0) {
      return;
    }

    const agent = this.agent;

    if (this.snapshot.isRunning || agent.isRunning) {
      throw new Error("智能体运行时正在处理另一条消息。");
    }

    agent.addMessage({
      id: createMessageId("user"),
      role: "user",
      content: message,
    });

    try {
      const run = agent.runAgent();
      this.syncFromAgent(agent, { error: undefined, isRunning: true });
      await run;
    } catch (error) {
      const runError = toError(error);
      this.syncFromAgent(agent, { error: runError, isRunning: false });
      throw runError;
    } finally {
      this.syncFromAgent(agent, { isRunning: false });
    }
  }

  async startNewConversation(): Promise<void> {
    if (this.snapshot.isRunning || this.agent.isRunning) {
      throw new Error("智能体运行时正在处理另一条消息。");
    }

    let nextAgent: AgentClient;
    try {
      nextAgent = this.createClient({
        ...this.config,
        threadId: crypto.randomUUID(),
      });
    } catch (error) {
      const runtimeError = toError(error);
      this.publish({ ...this.snapshot, error: runtimeError });
      throw runtimeError;
    }

    this.unsubscribeFromAgent?.();
    this.agent = nextAgent;
    this.unsubscribeFromAgent = this.subscribeToAgent(nextAgent);
    this.publish({
      messages: nextAgent.messages.map(mapAgUiMessage),
      state: nextAgent.state,
      isRunning: nextAgent.isRunning,
      error: undefined,
    });
  }

  abort(): void {
    this.agent.abortRun();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeFromAgent?.();
    this.unsubscribeFromAgent = undefined;
    super.dispose();
  }

  private syncFromAgent(
    agent: AgentClient,
    overrides: Partial<Pick<AgentTransportSnapshot, "error" | "isRunning">> = {},
  ): void {
    if (this.disposed || agent !== this.agent) {
      return;
    }

    this.publish({
      messages: agent.messages.map(mapAgUiMessage),
      state: agent.state,
      isRunning: overrides.isRunning ?? agent.isRunning,
      error: Object.hasOwn(overrides, "error")
        ? overrides.error
        : this.snapshot.error,
    });
  }
}

export function createAgUiTransport(options: {
  endpoint?: string | undefined;
}): AgUiTransport {
  const endpoint = options.endpoint?.trim();
  if (!endpoint) {
    throw new Error("必须配置智能体运行时端点。");
  }
  return new AgUiTransport({ endpoint });
}
