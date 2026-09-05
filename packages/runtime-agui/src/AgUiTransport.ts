import { HttpAgent, type AgentSubscriber } from "@ag-ui/client";
import type { Message, State } from "@ag-ui/core";
import {
  ObservableAgentTransport,
  type AgentConversation,
  type AgentRunState,
  type AgentRuntimeError,
  type AgentUserInput,
} from "@agent-ui/runtime-core";

import { mapAgentUserInput } from "./input-mapper.js";
import { mapAgUiMessage } from "./message-mapper.js";

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

interface SnapshotOverrides {
  conversation?: AgentConversation | undefined;
  run?: AgentRunState | undefined;
}

function createMessageId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function toRuntimeError(value: unknown): AgentRuntimeError {
  const error = toError(value);
  const code = "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
  return {
    message: error.message,
    ...(code === undefined ? {} : { code }),
  };
}

function retainProtocolError(
  current: AgentRunState,
  fallback: unknown,
): AgentRuntimeError {
  return current.status === "error" && current.error !== undefined
    ? current.error
    : toRuntimeError(fallback);
}

function isEmptyInput(input: AgentUserInput): boolean {
  return typeof input.content === "string"
    ? input.content.trim().length === 0
    : input.content.length === 0;
}

function createRunState(
  status: AgentRunState["status"],
  id?: string,
  error?: AgentRuntimeError,
): AgentRunState {
  return {
    ...(id === undefined ? {} : { id }),
    status,
    ...(error === undefined ? {} : { error }),
  };
}

export class AgUiTransport<TState = unknown>
  extends ObservableAgentTransport<TState> {
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
    const conversationId = crypto.randomUUID();
    const agent = createClient({ ...config, threadId: conversationId });
    super({
      conversation: { id: conversationId },
      messages: agent.messages.map(mapAgUiMessage),
      state: agent.state as TState,
      run: createRunState(agent.isRunning ? "running" : "idle"),
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
        this.syncFromAgent(agent, {
          run: createRunState("running", this.snapshot.run.id),
        }),
      onRunStartedEvent: ({ event }) =>
        this.syncFromAgent(agent, {
          conversation: { id: event.threadId },
          run: createRunState("running", event.runId),
        }),
      onRunFinishedEvent: ({ event }) =>
        this.syncFromAgent(agent, {
          run: createRunState("idle", event.runId),
        }),
      onRunErrorEvent: ({ event }) =>
        this.syncFromAgent(agent, {
          run: createRunState(
            "error",
            this.snapshot.run.id,
            {
              message: event.message,
              ...(event.code === undefined ? {} : { code: event.code }),
            },
          ),
        }),
      onRunFailed: ({ error }) =>
        this.syncFromAgent(agent, {
          run: createRunState(
            "error",
            this.snapshot.run.id,
            retainProtocolError(this.snapshot.run, error),
          ),
        }),
      onRunFinalized: () => {
        if (this.snapshot.run.status === "running") {
          this.syncFromAgent(agent, {
            run: createRunState("idle", this.snapshot.run.id),
          });
        } else {
          this.syncFromAgent(agent);
        }
      },
    });

    return () => subscription.unsubscribe();
  }

  async sendMessage(input: AgentUserInput): Promise<void> {
    if (isEmptyInput(input)) {
      return;
    }

    const agent = this.agent;

    if (this.snapshot.run.status === "running" || agent.isRunning) {
      throw new Error("智能体运行时正在处理另一条消息。");
    }

    agent.addMessage(mapAgentUserInput(input, createMessageId("user")));

    try {
      this.syncFromAgent(agent, { run: createRunState("running") });
      const run = agent.runAgent();
      await run;
    } catch (error) {
      const runError = toError(error);
      this.syncFromAgent(agent, {
        run: createRunState(
          "error",
          this.snapshot.run.id,
          retainProtocolError(this.snapshot.run, runError),
        ),
      });
      throw runError;
    } finally {
      if (this.snapshot.run.status === "running") {
        this.syncFromAgent(agent, {
          run: createRunState("idle", this.snapshot.run.id),
        });
      }
    }
  }

  async startNewConversation(): Promise<void> {
    if (this.snapshot.run.status === "running" || this.agent.isRunning) {
      throw new Error("智能体运行时正在处理另一条消息。");
    }

    const conversationId = crypto.randomUUID();
    let nextAgent: AgentClient;
    try {
      nextAgent = this.createClient({
        ...this.config,
        threadId: conversationId,
      });
    } catch (error) {
      const runtimeError = toError(error);
      this.publish({
        ...this.snapshot,
        run: createRunState("error", undefined, toRuntimeError(runtimeError)),
      });
      throw runtimeError;
    }

    this.unsubscribeFromAgent?.();
    this.agent = nextAgent;
    this.unsubscribeFromAgent = this.subscribeToAgent(nextAgent);
    this.publish({
      conversation: { id: conversationId },
      messages: nextAgent.messages.map(mapAgUiMessage),
      state: nextAgent.state as TState,
      run: createRunState(nextAgent.isRunning ? "running" : "idle"),
    });
  }

  abort(): void {
    this.agent.abortRun();
    if (this.snapshot.run.status === "running") {
      this.publish({
        ...this.snapshot,
        run: createRunState("idle", this.snapshot.run.id),
      });
    }
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
    overrides: SnapshotOverrides = {},
  ): void {
    if (this.disposed || agent !== this.agent) {
      return;
    }

    this.publish({
      conversation: overrides.conversation ?? this.snapshot.conversation,
      messages: agent.messages.map(mapAgUiMessage),
      state: agent.state as TState,
      run: overrides.run ?? this.snapshot.run,
    });
  }
}

export function createAgUiTransport<TState = unknown>(options: {
  endpoint?: string | undefined;
}): AgUiTransport<TState> {
  const endpoint = options.endpoint?.trim();
  if (!endpoint) {
    throw new Error("必须配置智能体运行时端点。");
  }
  return new AgUiTransport<TState>({ endpoint });
}
