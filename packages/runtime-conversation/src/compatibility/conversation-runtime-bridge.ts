import type {
  AgentApplicationEventListener,
  AgentInterruptResponse,
  AgentRuntime,
  AgentRuntimeSnapshot,
  AgentUserInput,
} from "@agent-ui/runtime-core";
import type { AgUiAssistantRuntime } from "@assistant-ui/react-ag-ui";

import type { ConversationApplicationEventSource } from "../events/conversation-application-event-source.js";
import {
  AgentUiRuntimeBusyError,
  UnsupportedAgentInputError,
} from "../errors.js";
import { ConversationObservationSourceImpl } from "../observation/conversation-observation-source.js";
import type { ConversationObservationSource } from "../observation/types.js";
import type { ConversationThreadBinding } from "../threads/types.js";
import { projectConversationExecutions } from "./conversation-execution-projector.js";
import {
  mapConversationInterrupt,
  mapConversationInterruptResponse,
} from "./conversation-interrupt-mapper.js";
import { projectConversationMessages } from "./conversation-message-projector.js";

export { AgentUiRuntimeBusyError, UnsupportedAgentInputError } from "../errors.js";

interface PendingSend {
  sawRunning: boolean;
  resolve(): void;
  reject(error: Error): void;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export class UnsupportedInterruptResponseMetadataError extends Error {
  readonly code = "AGENT_UI_UNSUPPORTED_INTERRUPT_RESPONSE_METADATA";

  constructor(interruptId: string) {
    super(
      `Conversation runtime does not support interrupt response metadata for "${interruptId}"`,
    );
    this.name = "UnsupportedInterruptResponseMetadataError";
  }
}

function mapTextInput(input: string | AgentUserInput): string {
  if (typeof input === "string") return input;
  if (typeof input.content === "string") return input.content;
  const text: string[] = [];
  for (const part of input.content) {
    if (part.type !== "text") throw new UnsupportedAgentInputError(part.type);
    text.push(part.text);
  }
  return text.join("");
}

function validateInterruptResponses<TState>(
  snapshot: AgentRuntimeSnapshot<TState>,
  responses: readonly AgentInterruptResponse[],
): void {
  if (snapshot.interrupts.length === 0) throw new Error("No pending interrupts");
  const ids = responses.map((response) => response.interruptId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Interrupt responses must not contain duplicate IDs");
  }
  const pending = new Set(snapshot.interrupts.map((interrupt) => interrupt.id));
  const unknown = ids.find((id) => !pending.has(id));
  if (unknown !== undefined) throw new Error(`Unknown interrupt response ID: ${unknown}`);
  const missing = snapshot.interrupts.find((interrupt) => !ids.includes(interrupt.id));
  if (missing !== undefined) {
    throw new Error(`Missing response for pending interrupt: ${missing.id}`);
  }
}

export interface ConversationAgentRuntimeBridgeOptions<TState> {
  runtime: AgUiAssistantRuntime;
  threadBinding: ConversationThreadBinding<TState>;
  applicationEvents: ConversationApplicationEventSource;
}

/** Passive compatibility projection over the upstream-owned Runtime. */
export class ConversationAgentRuntimeBridge<TState = unknown>
  implements AgentRuntime<TState> {
  readonly mode = "conversation";
  readonly observation: ConversationObservationSource;

  private readonly listeners = new Set<() => void>();
  private readonly unsubscribers: Array<() => void> = [];
  private readonly observationSource: ConversationObservationSourceImpl;
  private snapshot: AgentRuntimeSnapshot<TState>;
  private pendingSend: PendingSend | undefined;
  private actionInFlight = false;
  private projectionSuspended = false;
  private runtimeError: Error | undefined;
  private disposed = false;

  constructor(private readonly options: ConversationAgentRuntimeBridgeOptions<TState>) {
    this.observationSource = new ConversationObservationSourceImpl(
      options.runtime.thread,
      () => options.threadBinding.getThreadId(),
    );
    this.observation = this.observationSource;
    this.snapshot = this.projectSnapshot();
  }

  start(): void {
    if (this.disposed) throw new Error("The conversation runtime was disposed");
    if (this.unsubscribers.length > 0) return;
    this.observationSource.start();
    this.unsubscribers.push(
      this.options.runtime.thread.subscribe(() => this.sync()),
      this.options.runtime.threads.subscribe(() => this.sync()),
      this.options.threadBinding.subscribe(() => this.sync()),
    );
    this.sync();
  }

  getSnapshot = (): AgentRuntimeSnapshot<TState> => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  subscribeApplicationEvents = (
    listener: AgentApplicationEventListener,
  ): (() => void) => this.options.applicationEvents.subscribe(listener);

  async sendMessage(input: string | AgentUserInput): Promise<void> {
    this.assertAvailable();
    if (this.snapshot.interrupts.length > 0) {
      throw new Error("当前会话正在等待用户响应，请先处理 pending interrupts。");
    }
    const text = mapTextInput(input);
    if (text.length === 0) return;
    this.actionInFlight = true;
    this.runtimeError = undefined;
    const settled = new Promise<void>((resolve, reject) => {
      this.pendingSend = { sawRunning: false, resolve, reject };
    });
    try {
      this.options.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text }],
        startRun: true,
      });
      this.sync();
    } catch (error) {
      this.finishPending(toError(error));
    }
    return settled;
  }

  async resumeInterrupts(responses: AgentInterruptResponse[]): Promise<void> {
    this.assertAvailable();
    validateInterruptResponses(this.snapshot, responses);
    const unsupported = responses.find(
      (response) => response.metadata !== undefined,
    );
    if (unsupported !== undefined) {
      throw new UnsupportedInterruptResponseMetadataError(
        unsupported.interruptId,
      );
    }
    this.actionInFlight = true;
    this.runtimeError = undefined;
    try {
      await this.options.runtime.unstable_submitInterruptResponses(
        responses.map(mapConversationInterruptResponse),
      );
    } catch (error) {
      this.recordError(error);
      throw error;
    } finally {
      this.actionInFlight = false;
      this.sync();
    }
  }

  async startNewConversation(): Promise<void> {
    this.assertAvailable();
    if (this.options.runtime.thread.getState().isRunning) {
      throw new AgentUiRuntimeBusyError();
    }
    this.actionInFlight = true;
    this.projectionSuspended = true;
    try {
      await this.options.runtime.threads.switchToNewThread();
    } finally {
      this.projectionSuspended = false;
      this.actionInFlight = false;
      this.runtimeError = undefined;
      this.sync();
    }
  }

  abort(): void {
    if (this.disposed) return;
    this.options.runtime.thread.cancelRun();
    this.sync();
  }

  recordError(value: unknown): void {
    const error = toError(value);
    this.runtimeError = error;
    if (this.pendingSend !== undefined) this.finishPending(error);
    else this.sync();
  }

  recordCancellation(): void {
    this.runtimeError = undefined;
    this.finishPending();
    this.sync();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.listeners.clear();
  }

  stop(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;
    this.observationSource.stop();
    this.runtimeError = undefined;
    this.finishPending();
  }

  private assertAvailable(): void {
    if (this.disposed) throw new Error("The conversation runtime was disposed");
    if (this.actionInFlight || this.options.runtime.thread.getState().isRunning) {
      throw new AgentUiRuntimeBusyError();
    }
  }

  private finishPending(error?: Error): void {
    const pending = this.pendingSend;
    this.pendingSend = undefined;
    this.actionInFlight = false;
    if (pending === undefined) return;
    if (error === undefined) pending.resolve();
    else pending.reject(error);
  }

  private sync(): void {
    if (this.disposed || this.projectionSuspended) return;
    this.observationSource.sync();
    this.snapshot = this.projectSnapshot();
    const pending = this.pendingSend;
    if (pending !== undefined) {
      if (this.snapshot.run.status === "running") pending.sawRunning = true;
      else if (pending.sawRunning) this.finishPending();
    }
    for (const listener of this.listeners) listener();
  }

  private projectSnapshot(): AgentRuntimeSnapshot<TState> {
    const thread = this.options.runtime.thread.getState();
    const interrupts = this.options.runtime.unstable_getPendingInterrupts()
      .map(mapConversationInterrupt);
    const run = this.runtimeError === undefined
      ? {
          status: interrupts.length > 0
            ? "awaiting-input" as const
            : thread.isRunning ? "running" as const : "idle" as const,
        }
      : {
          status: "error" as const,
          error: { message: this.runtimeError.message },
        };
    return {
      conversation: { id: this.options.threadBinding.getThreadId() },
      messages: projectConversationMessages(thread.messages),
      state: thread.state as TState,
      run,
      executions: projectConversationExecutions(thread.messages),
      interrupts,
    };
  }
}

export function createConversationAgentRuntimeBridge<TState = unknown>(
  options: ConversationAgentRuntimeBridgeOptions<TState>,
): ConversationAgentRuntimeBridge<TState> {
  return new ConversationAgentRuntimeBridge(options);
}
