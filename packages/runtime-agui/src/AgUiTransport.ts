import {
  HttpAgent,
  type AgentSubscriber,
  type RunAgentParameters,
} from "@ag-ui/client";
import type { Message, State, Tool, ToolMessage } from "@ag-ui/core";
import {
  ObservableAgentTransport,
  type AgentConversation,
  type AgentFrontendToolResult,
  type AgentFrontendToolSource,
  type AgentInterrupt,
  type AgentInterruptResponse,
  type AgentRunState,
  type AgentRuntimeError,
  type AgentUserInput,
} from "@agent-ui/runtime-core";

import { mapAgentUserInput } from "./input-mapper.js";
import {
  mapAgUiInterrupt,
  mapInterruptResponse,
} from "./interrupt-mapper.js";
import { LifecycleProjector } from "./lifecycle-projector.js";
import {
  FrontendToolCoordinator,
  type CollectedFrontendToolCall,
} from "./frontend-tool-coordinator.js";
import { mapFrontendToolDefinition } from "./frontend-tool-mapper.js";

export interface AgUiTransportConfig {
  endpoint: string;
  frontendTools?: AgentFrontendToolSource | undefined;
}

interface AgentClient {
  readonly messages: Message[];
  readonly state: State;
  readonly isRunning: boolean;
  subscribe(subscriber: AgentSubscriber): { unsubscribe(): void };
  addMessage(message: Message): void;
  runAgent(parameters?: RunAgentParameters): Promise<unknown>;
  abortRun(): void;
}

interface AgentClientConfig {
  endpoint: string;
  threadId: string;
}

type AgentClientFactory = (config: AgentClientConfig) => AgentClient;

interface SnapshotOverrides {
  conversation?: AgentConversation | undefined;
  run?: AgentRunState | undefined;
  interrupts?: AgentInterrupt[] | undefined;
}

type PendingRunKind = "fresh" | "resume" | "tool-continuation";

interface LogicalOperation {
  agent: AgentClient;
  controller: AbortController;
}

const abortedOperation = Symbol("aborted-operation");

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

function waitForAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T | typeof abortedOperation> {
  if (signal.aborted) {
    return Promise.resolve(abortedOperation);
  }

  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      resolve(abortedOperation);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

export class AgUiTransport<TState = unknown>
  extends ObservableAgentTransport<TState> {
  readonly mode = "http" as const;

  private agent: AgentClient;
  private readonly projector: LifecycleProjector;
  private readonly frontendToolCoordinator = new FrontendToolCoordinator();
  private readonly config: AgUiTransportConfig;
  private readonly createClient: AgentClientFactory;
  private unsubscribeFromAgent: (() => void) | undefined;
  private disposed = false;
  private pendingRunKind: PendingRunKind | undefined;
  private pendingFrontendCalls: CollectedFrontendToolCall[] = [];
  private operation: LogicalOperation | undefined;

  constructor(
    config: AgUiTransportConfig,
    createClient: AgentClientFactory = ({ endpoint, threadId }) =>
      new HttpAgent({ url: endpoint, threadId }),
  ) {
    const conversationId = crypto.randomUUID();
    const agent = createClient({
      endpoint: config.endpoint,
      threadId: conversationId,
    });
    const projector = new LifecycleProjector();
    super({
      conversation: { id: conversationId },
      messages: projector.projectMessages(agent.messages),
      state: agent.state as TState,
      run: createRunState(agent.isRunning ? "running" : "idle"),
      executions: projector.getExecutions(),
      interrupts: [],
    });
    this.projector = projector;
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
      onRunStartedEvent: ({ event, input }) => {
        const runKind: PendingRunKind = (input?.resume?.length ?? 0) > 0
          ? "resume"
          : this.pendingRunKind ?? "fresh";
        this.pendingRunKind = undefined;
        if (runKind === "resume" || runKind === "tool-continuation") {
          this.projector.startContinuationRun();
        } else {
          this.projector.resetForFreshRun();
        }
        this.syncFromAgent(agent, {
          conversation: { id: event.threadId },
          run: createRunState("running", event.runId),
        });
      },
      onRunFinishedEvent: (parameters) => {
        const { event } = parameters;
        if (parameters.outcome === "interrupt") {
          this.frontendToolCoordinator.discardWireRun();
          this.pendingFrontendCalls = [];
          this.projector.interruptActive();
          this.syncFromAgent(agent, {
            run: createRunState("awaiting-input", event.runId),
            interrupts: parameters.interrupts.map(mapAgUiInterrupt),
          });
        } else {
          this.pendingFrontendCalls =
            this.frontendToolCoordinator.finishSuccessfulWireRun();
          this.projector.interruptActive({
            preserveToolIds: new Set(
              this.pendingFrontendCalls.map(({ call }) => call.id),
            ),
          });
          this.syncFromAgent(agent, {
            run: createRunState("idle", event.runId),
            interrupts: [],
          });
        }
      },
      onRunErrorEvent: ({ event }) => {
        this.frontendToolCoordinator.discardWireRun();
        this.pendingFrontendCalls = [];
        this.projector.interruptActive();
        this.syncFromAgent(agent, {
          run: createRunState(
            "error",
            this.snapshot.run.id,
            {
              message: event.message,
              ...(event.code === undefined ? {} : { code: event.code }),
            },
          ),
        });
      },
      onRunFailed: ({ error }) => {
        this.frontendToolCoordinator.discardWireRun();
        this.pendingFrontendCalls = [];
        this.projector.interruptActive();
        this.syncFromAgent(agent, {
          run: createRunState(
            "error",
            this.snapshot.run.id,
            retainProtocolError(this.snapshot.run, error),
          ),
        });
      },
      onRunFinalized: () => {
        if (this.snapshot.run.status === "running") {
          this.projector.interruptActive();
          this.syncFromAgent(agent, {
            run: createRunState("idle", this.snapshot.run.id),
            interrupts: [],
          });
        } else {
          this.syncFromAgent(agent);
        }
      },
      onTextMessageStartEvent: ({ event }) => {
        this.projector.onTextMessageStart(event);
        this.syncFromAgent(agent);
      },
      onTextMessageContentEvent: ({ event }) => {
        this.projector.onTextMessageContent(event);
        this.syncFromAgent(agent);
      },
      onTextMessageEndEvent: ({ event }) => {
        this.projector.onTextMessageEnd(event);
        this.syncFromAgent(agent);
      },
      onToolCallStartEvent: ({ event }) => {
        this.frontendToolCoordinator.onToolCallStart(event);
        this.projector.onToolCallStart(event);
        this.syncFromAgent(agent);
      },
      onToolCallArgsEvent: ({ event }) => {
        this.frontendToolCoordinator.onToolCallArgs(event);
        this.projector.onToolCallArgs(event);
        this.syncFromAgent(agent);
      },
      onToolCallEndEvent: ({ event }) => {
        this.frontendToolCoordinator.onToolCallEnd(event);
        this.projector.onToolCallEnd(event);
        this.syncFromAgent(agent);
      },
      onToolCallResultEvent: ({ event }) => {
        this.frontendToolCoordinator.onToolCallResult(event);
        this.projector.onToolCallResult(event);
        this.syncFromAgent(agent);
      },
      onReasoningStartEvent: ({ event }) => {
        this.projector.onReasoningStart(event);
        this.syncFromAgent(agent);
      },
      onReasoningMessageStartEvent: ({ event }) => {
        this.projector.onReasoningMessageStart(event);
        this.syncFromAgent(agent);
      },
      onReasoningMessageContentEvent: ({ event }) => {
        this.projector.onReasoningMessageContent(event);
        this.syncFromAgent(agent);
      },
      onReasoningMessageEndEvent: ({ event }) => {
        this.projector.onReasoningMessageEnd(event);
        this.syncFromAgent(agent);
      },
      onReasoningEndEvent: ({ event }) => {
        this.projector.onReasoningEnd(event);
        this.syncFromAgent(agent);
      },
      onStepStartedEvent: ({ event }) => {
        this.projector.onStepStarted(event);
        this.syncFromAgent(agent);
      },
      onStepFinishedEvent: ({ event }) => {
        this.projector.onStepFinished(event);
        this.syncFromAgent(agent);
      },
      onSubagentStartedEvent: ({ event }) => {
        this.projector.onSubagentStarted(event);
        this.syncFromAgent(agent);
      },
      onSubagentFinishedEvent: ({ event }) => {
        this.projector.onSubagentFinished(event);
        this.syncFromAgent(agent);
      },
      onSubagentErrorEvent: ({ event }) => {
        this.projector.onSubagentError(event);
        this.syncFromAgent(agent);
      },
      onCustomEvent: ({ event }) => {
        if (this.disposed || agent !== this.agent) {
          return;
        }
        // Wire boundary for the Custom Event Protocol: keep AG-UI details here
        // and expose only a protocol-independent, defensively cloned event.
        this.emitApplicationEvent({
          name: event.name,
          payload: structuredClone(event.value),
          producer: event.subagentRunId === undefined
            ? { type: "root" }
            : { type: "subagent", id: event.subagentRunId },
        });
      },
    });

    return () => subscription.unsubscribe();
  }

  async sendMessage(input: AgentUserInput): Promise<void> {
    if (this.snapshot.interrupts.length > 0) {
      throw new Error(
        "当前会话正在等待用户响应，请先处理 pending interrupts。",
      );
    }

    if (isEmptyInput(input)) {
      return;
    }

    const agent = this.agent;

    if (
      this.operation !== undefined ||
      this.snapshot.run.status === "running" ||
      agent.isRunning
    ) {
      throw new Error("智能体运行时正在处理另一条消息。");
    }

    this.frontendToolCoordinator.resetLogicalChain();
    agent.addMessage(mapAgentUserInput(input, createMessageId("user")));
    await this.runLogicalOperation(agent, "fresh");
  }

  async resumeInterrupts(
    responses: AgentInterruptResponse[],
  ): Promise<void> {
    const agent = this.agent;
    if (this.snapshot.interrupts.length === 0) {
      throw new Error("No pending interrupts");
    }
    if (
      this.operation !== undefined ||
      this.snapshot.run.status === "running" ||
      agent.isRunning
    ) {
      throw new Error("Cannot resume interrupts while the agent is running");
    }
    await this.runLogicalOperation(agent, "resume", {
      resume: responses.map(mapInterruptResponse),
    });
  }

  async startNewConversation(): Promise<void> {
    if (
      this.operation !== undefined ||
      this.snapshot.run.status === "running" ||
      this.agent.isRunning
    ) {
      throw new Error("智能体运行时正在处理另一条消息。");
    }

    const conversationId = crypto.randomUUID();
    let nextAgent: AgentClient;
    try {
      nextAgent = this.createClient({
        endpoint: this.config.endpoint,
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
    this.frontendToolCoordinator.resetLogicalChain();
    this.pendingFrontendCalls = [];
    this.projector.resetConversation();
    this.agent = nextAgent;
    this.unsubscribeFromAgent = this.subscribeToAgent(nextAgent);
    this.publish({
      conversation: { id: conversationId },
      messages: this.projector.projectMessages(nextAgent.messages),
      state: nextAgent.state as TState,
      run: createRunState(nextAgent.isRunning ? "running" : "idle"),
      executions: this.projector.getExecutions(),
      interrupts: [],
    });
  }

  abort(): void {
    if (this.snapshot.run.status === "awaiting-input") {
      return;
    }
    this.operation?.controller.abort();
    this.agent.abortRun();
    this.frontendToolCoordinator.discardWireRun();
    this.pendingFrontendCalls = [];
    this.projector.interruptActive();
    if (this.snapshot.run.status === "running") {
      this.syncFromAgent(this.agent, {
        run: createRunState("idle", this.snapshot.run.id),
      });
    } else {
      this.syncFromAgent(this.agent);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.operation?.controller.abort();
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

    const nextMessages = this.projector.projectMessages(agent.messages);
    const nextExecutions = this.projector.getExecutions();
    const nextSnapshot = {
      conversation: overrides.conversation ?? this.snapshot.conversation,
      messages: nextMessages,
      state: agent.state as TState,
      run: overrides.run ?? this.snapshot.run,
      executions: nextExecutions,
      interrupts: overrides.interrupts ?? this.snapshot.interrupts,
    };

    if (
      nextSnapshot.conversation === this.snapshot.conversation &&
      nextSnapshot.messages === this.snapshot.messages &&
      nextSnapshot.state === this.snapshot.state &&
      nextSnapshot.run === this.snapshot.run &&
      nextSnapshot.executions === this.snapshot.executions &&
      nextSnapshot.interrupts === this.snapshot.interrupts
    ) {
      return;
    }

    this.publish(nextSnapshot);
  }

  private async runLogicalOperation(
    agent: AgentClient,
    initialKind: PendingRunKind,
    initialParameters: RunAgentParameters = {},
  ): Promise<void> {
    const operation: LogicalOperation = {
      agent,
      controller: new AbortController(),
    };
    this.operation = operation;

    let runKind = initialKind;
    let parameters = initialParameters;

    try {
      while (!operation.controller.signal.aborted) {
        const definitions = this.config.frontendTools?.listTools() ?? [];
        const tools: Tool[] = definitions.map(mapFrontendToolDefinition);
        this.frontendToolCoordinator.startWireRun(definitions);
        this.pendingFrontendCalls = [];
        this.pendingRunKind = runKind;
        this.syncFromAgent(agent, { run: createRunState("running") });

        const wireResult = await waitForAbort(
          Promise.resolve(agent.runAgent({ ...parameters, tools })),
          operation.controller.signal,
        );
        if (
          wireResult === abortedOperation ||
          !this.isCurrentOperation(operation)
        ) {
          return;
        }

        const calls = this.pendingFrontendCalls;
        this.pendingFrontendCalls = [];
        if (calls.length === 0) {
          return;
        }

        await this.executeFrontendTools(calls, operation);
        if (
          operation.controller.signal.aborted ||
          !this.isCurrentOperation(operation)
        ) {
          return;
        }

        runKind = "tool-continuation";
        parameters = {};
      }
    } catch (error) {
      if (operation.controller.signal.aborted) {
        return;
      }
      const runError = toError(error);
      this.frontendToolCoordinator.discardWireRun();
      this.pendingFrontendCalls = [];
      this.projector.interruptActive();
      this.syncFromAgent(agent, {
        run: createRunState(
          "error",
          this.snapshot.run.id,
          retainProtocolError(this.snapshot.run, runError),
        ),
      });
      throw runError;
    } finally {
      if (this.isCurrentOperation(operation)) {
        this.operation = undefined;
      }
      if (this.snapshot.run.status === "running") {
        this.projector.interruptActive();
        this.syncFromAgent(agent, {
          run: createRunState("idle", this.snapshot.run.id),
          interrupts: [],
        });
      }
      this.pendingRunKind = undefined;
    }
  }

  private async executeFrontendTools(
    calls: readonly CollectedFrontendToolCall[],
    operation: LogicalOperation,
  ): Promise<void> {
    const source = this.config.frontendTools;
    if (source === undefined) return;

    for (const collected of calls) {
      if (
        operation.controller.signal.aborted ||
        !this.isCurrentOperation(operation)
      ) {
        return;
      }

      let result: AgentFrontendToolResult;
      let input: unknown;
      try {
        input = collected.rawArguments.trim().length === 0
          ? {}
          : JSON.parse(collected.rawArguments);
      } catch (error) {
        result = {
          content: "Invalid frontend tool arguments",
          error: `Invalid frontend tool arguments: ${toError(error).message}`,
        };
        this.addFrontendToolMessage(collected, result, operation);
        continue;
      }

      try {
        const execution = waitForAbort(
          Promise.resolve(source.execute(
            { ...collected.call, input },
            { signal: operation.controller.signal },
          )),
          operation.controller.signal,
        );
        const executionResult = await execution;
        if (executionResult === abortedOperation) return;
        result = executionResult;
      } catch (error) {
        const message = toError(error).message;
        result = {
          content: `Frontend tool execution failed: ${message}`,
          error: message,
        };
      }

      this.addFrontendToolMessage(collected, result, operation);
    }
  }

  private addFrontendToolMessage(
    collected: CollectedFrontendToolCall,
    result: AgentFrontendToolResult,
    operation: LogicalOperation,
  ): void {
    if (
      operation.controller.signal.aborted ||
      !this.isCurrentOperation(operation)
    ) {
      return;
    }

    const message: ToolMessage = {
      id: createMessageId("tool"),
      role: "tool",
      toolCallId: collected.call.id,
      content: result.content,
      ...(result.error === undefined ? {} : { error: result.error }),
      ...(collected.call.producer.type === "subagent"
        ? { subagentRunId: collected.call.producer.id }
        : {}),
    };
    operation.agent.addMessage(message);
    this.syncFromAgent(operation.agent);
  }

  private isCurrentOperation(operation: LogicalOperation): boolean {
    return !this.disposed &&
      this.operation === operation &&
      this.agent === operation.agent;
  }
}

export function createAgUiTransport<TState = unknown>(options: {
  endpoint?: string | undefined;
  frontendTools?: AgentFrontendToolSource | undefined;
}): AgUiTransport<TState> {
  const endpoint = options.endpoint?.trim();
  if (!endpoint) {
    throw new Error("必须配置智能体运行时端点。");
  }
  return new AgUiTransport<TState>({
    endpoint,
    ...(options.frontendTools === undefined
      ? {}
      : { frontendTools: options.frontendTools }),
  });
}
