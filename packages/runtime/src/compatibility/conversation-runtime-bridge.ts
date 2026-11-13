import type {
  AgentApplicationEventListener,
  AgentInterruptResponse,
  AgentRuntime,
  AgentRuntimeSnapshot,
  AgentUserInput,
} from "@za38.03/agent-ui-core";
import type { ConversationCommandDecisionRequest } from "../plugin-api/index.js";
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
  matchOnInterruptToolCall,
  parseLangGraphCommandRequests,
  parseOnInterruptCommandRequests,
  sameOnInterruptCommandRequest,
  type LangGraphCommandRequest,
  type OnInterruptCommandRequest,
} from "./command-decision.js";
import type { ConversationCommandForwarder } from "./conversation-command-forwarding-agent.js";
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
  onAbort?: (() => void) | undefined;
  threadBinding: ConversationThreadBinding<TState>;
  applicationEvents: ConversationApplicationEventSource;
  commandForwarder?: ConversationCommandForwarder | undefined;
  switchToNewThread?: (() => Promise<void>) | undefined;
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
  private pendingOnInterruptRequests: OnInterruptCommandRequest[] = [];
  private readonly commandDecisionRequests = new Map<string, ConversationCommandDecisionRequest>();
  private readonly structuredCommandRequests = new Map<string, LangGraphCommandRequest>();
  private readonly structuredCommandDecisions = new Map<string, Map<number, { request: LangGraphCommandRequest; type: string }>>();
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
      this.options.applicationEvents.subscribe((event) => {
        if (event.name !== "ON_INTERRUPT" && event.name !== "on_interrupt") return;
        this.pendingOnInterruptRequests = parseOnInterruptCommandRequests(event.payload) ?? [];
        this.commandDecisionRequests.clear();
        this.sync();
      }),
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
    if (this.snapshot.interrupts.length > 0 || this.commandDecisionRequests.size > 0) {
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

  getCommandDecisionRequest(toolCallId: string): ConversationCommandDecisionRequest | undefined {
    return this.commandDecisionRequests.get(toolCallId);
  }

  async submitCommandDecision(toolCallId: string, decisionType: string): Promise<void> {
    this.assertAvailable();
    const decisionRequest = this.commandDecisionRequests.get(toolCallId);
    if (decisionRequest === undefined) throw new Error(`No pending command decision for tool call "${toolCallId}"`);
    if (!decisionRequest.allowedDecisions.includes(decisionType)) {
      throw new Error(`Unsupported command decision "${decisionType}" for tool call "${toolCallId}"`);
    }
    const structuredRequest = this.structuredCommandRequests.get(toolCallId);
    if (structuredRequest !== undefined) {
      return this.submitStructuredCommandDecision(structuredRequest, decisionType);
    }
    // A legacy notification must never bypass an authoritative native interrupt.
    if (this.snapshot.interrupts.length > 0) validateInterruptResponses(this.snapshot, []);
    const commandForwarder = this.options.commandForwarder;
    if (commandForwarder === undefined) throw new Error("Command decision forwarding is unavailable");

    commandForwarder.setNextCommand({ decisions: [{ type: decisionType }] });
    this.commandDecisionRequests.delete(toolCallId);
    this.actionInFlight = true;
    this.runtimeError = undefined;
    const settled = new Promise<void>((resolve, reject) => {
      this.pendingSend = { sawRunning: false, resolve, reject };
    });
    try {
      this.options.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: decisionType }],
        startRun: true,
      });
      this.sync();
    } catch (error) {
      commandForwarder.clearNextCommand();
      this.commandDecisionRequests.set(toolCallId, decisionRequest);
      this.finishPending(toError(error));
    }
    return settled;
  }

  private async submitStructuredCommandDecision(request: LangGraphCommandRequest, decisionType: string): Promise<void> {
    const decisions = this.structuredCommandDecisions.get(request.interruptId) ?? new Map();
    decisions.set(request.actionIndex, { request, type: decisionType });
    this.structuredCommandDecisions.set(request.interruptId, decisions);
    this.sync();
    const responses: AgentInterruptResponse[] = [];
    for (const interrupt of this.options.runtime.unstable_getPendingInterrupts()) {
      const requests = parseLangGraphCommandRequests(interrupt);
      const selected = this.structuredCommandDecisions.get(interrupt.id);
      if (requests === undefined || requests.some(item => !selected?.has(item.actionIndex))) return;
      responses.push({
        interruptId: interrupt.id,
        status: "resolved",
        payload: { decisions: requests.map(item => ({ type: selected!.get(item.actionIndex)!.type })) },
      });
    }
    try {
      await this.resumeInterrupts(responses);
    } catch (error) {
      decisions.delete(request.actionIndex);
      this.sync();
      throw error;
    }
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
    if (this.disposed) throw new Error("The conversation runtime was disposed");
    this.clearCommandDecisionRequests();
    await (this.options.switchToNewThread?.() ?? this.options.runtime.threads.switchToNewThread());
  }

  abort(): void {
    if (this.disposed) return;
    this.options.onAbort?.();
    this.options.runtime.thread.cancelRun();
    this.sync();
  }

  recordError(value: unknown): void {
    const error = toError(value);
    this.options.commandForwarder?.clearNextCommand();
    this.runtimeError = error;
    if (this.pendingSend !== undefined) this.finishPending(error);
    else this.sync();
  }

  recordCancellation(): void {
    this.options.onAbort?.();
    this.options.commandForwarder?.clearNextCommand();
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
    this.clearCommandDecisionRequests();
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
    this.projectCommandDecisionRequests();
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
    const awaitingCommandDecision = this.commandDecisionRequests.size > 0;
    const run = this.runtimeError === undefined
      ? {
          status: interrupts.length > 0 || awaitingCommandDecision
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

  private projectCommandDecisionRequests(): void {
    const executions = projectConversationExecutions(
      this.options.runtime.thread.getState().messages,
    );
    const pendingToolCallIds = new Set(
      executions
        .filter(execution => execution.type === "tool" &&
          (execution.status === "awaiting-result" || execution.status === "interrupted"))
        .map(execution => execution.id),
    );
    for (const toolCallId of this.commandDecisionRequests.keys()) {
      if (!pendingToolCallIds.has(toolCallId)) this.commandDecisionRequests.delete(toolCallId);
    }

    for (const toolCallId of this.structuredCommandRequests.keys()) this.commandDecisionRequests.delete(toolCallId);
    this.structuredCommandRequests.clear();
    const interrupts = this.options.runtime.unstable_getPendingInterrupts();
    const pendingInterruptIds = new Set(interrupts.map(interrupt => interrupt.id));
    for (const id of this.structuredCommandDecisions.keys()) {
      if (!pendingInterruptIds.has(id)) this.structuredCommandDecisions.delete(id);
    }
    const structuredToolCallIds = new Set<string>();
    for (const interrupt of interrupts) {
      const requests = parseLangGraphCommandRequests(interrupt);
      if (requests === undefined) continue;
      // Some servers emit both CUSTOM and RUN_FINISHED for the same approval.
      // The native interrupt owns continuation; discard its legacy duplicate.
      this.pendingOnInterruptRequests = this.pendingOnInterruptRequests.filter(
        legacy => !requests.some(request => sameOnInterruptCommandRequest(legacy, request)),
      );
      for (const request of requests) {
        const selected = this.structuredCommandDecisions.get(interrupt.id);
        const decision = selected?.get(request.actionIndex);
        if (decision !== undefined && (
          !sameOnInterruptCommandRequest(decision.request, request) ||
          decision.request.toolCallId !== request.toolCallId ||
          decision.request.decisionRequest.description !== request.decisionRequest.description ||
          JSON.stringify(decision.request.decisionRequest.allowedDecisions) !== JSON.stringify(request.decisionRequest.allowedDecisions)
        )) selected!.delete(request.actionIndex);
        const candidates = request.toolCallId === undefined ? executions
          : executions.filter(execution => execution.id === request.toolCallId);
        const toolCallId = matchOnInterruptToolCall(request, candidates, structuredToolCallIds);
        if (toolCallId === undefined) continue;
        structuredToolCallIds.add(toolCallId);
        this.structuredCommandRequests.set(toolCallId, request);
        if (this.structuredCommandDecisions.get(interrupt.id)?.has(request.actionIndex)) {
          this.commandDecisionRequests.delete(toolCallId);
        } else {
          this.commandDecisionRequests.set(toolCallId, request.decisionRequest);
        }
      }
    }

    const excluded = new Set([...this.commandDecisionRequests.keys(), ...structuredToolCallIds]);
    const remaining: OnInterruptCommandRequest[] = [];
    for (const request of this.pendingOnInterruptRequests) {
      const toolCallId = matchOnInterruptToolCall(request, executions, excluded);
      if (toolCallId === undefined) {
        remaining.push(request);
        continue;
      }
      this.commandDecisionRequests.set(toolCallId, request.decisionRequest);
      excluded.add(toolCallId);
    }
    this.pendingOnInterruptRequests = remaining;
  }

  private clearCommandDecisionRequests(): void {
    this.pendingOnInterruptRequests = [];
    this.commandDecisionRequests.clear();
    this.structuredCommandRequests.clear();
    this.structuredCommandDecisions.clear();
    this.options.commandForwarder?.clearNextCommand();
  }
}

export function createConversationAgentRuntimeBridge<TState = unknown>(
  options: ConversationAgentRuntimeBridgeOptions<TState>,
): ConversationAgentRuntimeBridge<TState> {
  return new ConversationAgentRuntimeBridge(options);
}
