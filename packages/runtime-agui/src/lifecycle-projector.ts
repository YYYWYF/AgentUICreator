import type {
  Message,
  ReasoningEndEvent,
  ReasoningMessageContentEvent,
  ReasoningMessageEndEvent,
  ReasoningMessageStartEvent,
  ReasoningStartEvent,
  StepFinishedEvent,
  StepStartedEvent,
  SubagentErrorEvent,
  SubagentFinishedEvent,
  SubagentStartedEvent,
  TextMessageContentEvent,
  TextMessageEndEvent,
  TextMessageStartEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallResultEvent,
  ToolCallStartEvent,
} from "@ag-ui/core";
import type {
  AgentExecution,
  AgentMessage,
  AgentMessagePart,
  AgentToolExecution,
  AgentMessageStreamStatus,
  AgentProducer,
  AgentReasoningExecution,
  AgentStepExecution,
  AgentSubagentExecution,
} from "@agent-ui/runtime-core";

import { mapAgUiMessage } from "./message-mapper.js";

function producerFor(subagentId?: string): AgentProducer {
  return subagentId === undefined
    ? { type: "root" }
    : { type: "subagent", id: subagentId };
}

function producerKey(producer: AgentProducer): string {
  return producer.type === "root" ? "root" : `subagent:${producer.id}`;
}

function equalProjectedProducer(
  left: AgentProducer,
  right: AgentProducer,
): boolean {
  if (left.type !== right.type) return false;
  return left.type === "root" ? true : left.id === right.id;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== "[object Object]") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function equalStructuredValue(
  left: unknown,
  right: unknown,
): boolean {
  if (Object.is(left, right)) return true;

  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    return left.every((value, index) => equalStructuredValue(value, right[index]));
  }

  if (Array.isArray(left) !== Array.isArray(right)) {
    return false;
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    if (leftKeys.length !== Object.keys(right).length) return false;

    return leftKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(right, key) &&
      equalStructuredValue(left[key], right[key]),
    );
  }

  return false;
}

function equalAgentMessagePart(
  left: AgentMessagePart,
  right: AgentMessagePart,
): boolean {
  const leftText = left.text;
  const rightText = right.text;
  const leftFilename = left.filename;
  const rightFilename = right.filename;
  const leftUrl = left.url;
  const rightUrl = right.url;

  return left.type === right.type
    && leftText === rightText
    && leftFilename === rightFilename
    && leftUrl === rightUrl
    && equalStructuredValue(left.metadata, right.metadata)
    && equalStructuredValue(left.source, right.source);
}

function equalProjectedToolExecution(
  current: AgentToolExecution,
  message: Extract<AgentMessage, { role: "tool" }>,
): boolean {
  const expectedError = message.error === undefined
    ? undefined
    : { message: message.error };

  return equalProjectedProducer(current.producer, message.producer)
    && current.status === (message.error === undefined ? "completed" : "error")
    && current.result?.messageId === message.id
    && current.result?.content === message.content
    && current.error?.message === expectedError?.message;
}

function equalProjectedMessage(
  left: AgentMessage,
  right: AgentMessage,
): boolean {
  if (
    left.id !== right.id ||
    left.role !== right.role ||
    left.streamStatus !== right.streamStatus ||
    !equalProjectedProducer(left.producer, right.producer)
  ) {
    return false;
  }

  if (!equalStructuredValue(left.metadata, right.metadata)) {
    return false;
  }

  switch (left.role) {
    case "user": {
      if (right.role !== "user") return false;
      if (typeof left.content !== typeof right.content) return false;

      if (typeof left.content === "string") {
        return left.content === right.content;
      }

      return left.content.length === right.content.length
        && left.content.every((part, index) => {
          const nextPart = right.content[index];
          return nextPart !== undefined
            && equalAgentMessagePart(part, nextPart);
        });
    }
    case "assistant": {
      if (right.role !== "assistant") return false;
      const contentEqual = left.content === right.content;
      if (!contentEqual) return false;
      if (
        (left.toolCalls === undefined) !== (right.toolCalls === undefined)
      ) return false;
      const leftToolCalls = left.toolCalls ?? [];
      const rightToolCalls = right.toolCalls ?? [];
      const toolCallsEqual = leftToolCalls.length === rightToolCalls.length
        && leftToolCalls.every((leftCall, index) => {
          const rightCall = rightToolCalls[index];
          return rightCall !== undefined
            && leftCall.id === rightCall.id
            && leftCall.type === rightCall.type
            && leftCall.function.name === rightCall.function.name
            && leftCall.function.arguments === rightCall.function.arguments;
        });
      return contentEqual && toolCallsEqual;
    }
    case "system":
    case "developer":
    case "reasoning":
      return left.content === right.content;
    case "tool": {
      if (right.role !== "tool") return false;
      return left.toolCallId === right.toolCallId
        && left.content === right.content
        && left.error === right.error;
    }
    case "activity": {
      if (right.role !== "activity") return false;
      return left.activityType === right.activityType
        && equalStructuredValue(left.content, right.content);
    }
    default:
      return false;
  }
}

function reconcileProjectedMessages(
  previous: readonly AgentMessage[],
  next: readonly AgentMessage[],
): AgentMessage[] {
  const previousById = new Map(previous.map((message) => [message.id, message]));
  const stable = next.map((message) => {
    const old = previousById.get(message.id);
    return old !== undefined && equalProjectedMessage(old, message) ? old : message;
  });

  if (
    stable.length === previous.length && stable.every((message, index) =>
      message === previous[index]
    )
  ) {
    return previous as AgentMessage[];
  }

  return stable;
}

function activeStepKey(producer: AgentProducer, name: string): string {
  return `${producerKey(producer)}\u0000${name}`;
}

function isActive(execution: AgentExecution): boolean {
  switch (execution.type) {
    case "tool":
      return execution.status === "preparing" ||
        execution.status === "awaiting-result";
    case "reasoning":
    case "step":
    case "subagent":
      return execution.status === "running";
  }
}

function interrupt(execution: AgentExecution): AgentExecution {
  return isActive(execution)
    ? { ...execution, status: "interrupted" }
    : execution;
}

/** Private AG-UI adapter state; public consumers receive only its projections. */
export class LifecycleProjector {
  private executions: AgentExecution[] = [];
  private projectedMessages: AgentMessage[] = [];
  private readonly messageStreamStatuses =
    new Map<string, AgentMessageStreamStatus>();
  private readonly messageProducers = new Map<string, AgentProducer>();
  private readonly activeReasoningByProducer = new Map<string, string>();
  private readonly activeSteps = new Map<string, string>();
  private continuationRun = false;

  getExecutions(): AgentExecution[] {
    return this.executions;
  }

  projectMessages(messages: readonly Message[]): AgentMessage[] {
    const projected = messages.map((message) => {
      const mapped = mapAgUiMessage(message);
      const producer = this.messageProducers.get(mapped.id) ?? mapped.producer;
      const streamStatus = this.messageStreamStatuses.get(mapped.id);
      const toolExecution = mapped.role === "tool"
        ? this.findExecution("tool", mapped.toolCallId)
        : undefined;

      return {
        ...mapped,
        producer: toolExecution?.producer ?? producer,
        ...(streamStatus === undefined ? {} : { streamStatus }),
      } as AgentMessage;
    });

    const stable = reconcileProjectedMessages(this.projectedMessages, projected);
    this.projectedMessages = stable;

    for (const message of stable) {
      if (message.role !== "tool") continue;
      const execution = this.findExecution("tool", message.toolCallId);
      if (execution === undefined) continue;
      this.updateExecution("tool", execution.id, (current) =>
        equalProjectedToolExecution(current, message)
          ? current
          : {
              ...current,
              producer: message.producer,
              status: message.error === undefined ? "completed" : "error",
              result: { messageId: message.id, content: message.content },
              ...(message.error === undefined
                ? { error: undefined }
                : { error: { message: message.error } }),
            });
    }

    return stable;
  }

  resetForFreshRun(): void {
    this.continuationRun = false;
    this.completeStreamingMessages();
    if (this.executions.length > 0) {
      this.executions = [];
    }
    this.activeReasoningByProducer.clear();
    this.activeSteps.clear();
  }

  startContinuationRun(): void {
    this.continuationRun = true;
  }

  resetConversation(): void {
    this.continuationRun = false;
    this.executions = [];
    this.projectedMessages = [];
    this.messageStreamStatuses.clear();
    this.messageProducers.clear();
    this.activeReasoningByProducer.clear();
    this.activeSteps.clear();
  }

  interruptActive(options: {
    preserveToolIds?: ReadonlySet<string> | undefined;
  } = {}): void {
    let changed = false;
    const nextExecutions = this.executions.map((execution) => {
      if (
        execution.type === "tool" &&
        options.preserveToolIds?.has(execution.id) === true
      ) {
        return execution;
      }
      const next = interrupt(execution);
      changed ||= next !== execution;
      return next;
    });
    if (changed) {
      this.executions = nextExecutions;
    }
    this.completeStreamingMessages();
    this.activeReasoningByProducer.clear();
    this.activeSteps.clear();
  }

  onTextMessageStart(event: TextMessageStartEvent): void {
    this.markMessageStreaming(event.messageId, event.subagentRunId);
  }

  onTextMessageContent(event: TextMessageContentEvent): void {
    this.markMessageStreaming(event.messageId, event.subagentRunId);
  }

  onTextMessageEnd(event: TextMessageEndEvent): void {
    this.completeMessageStream(event.messageId, event.subagentRunId);
  }

  onToolCallStart(event: ToolCallStartEvent): void {
    this.reactivateProducer(producerFor(event.subagentRunId));
    const current = this.findExecution("tool", event.toolCallId);
    if (current !== undefined) {
      if (current.status === "awaiting-result") {
        this.updateExecution("tool", event.toolCallId, (execution) => ({
          ...execution,
          status: "preparing",
        }));
      }
      return;
    }

    const execution: AgentToolExecution = {
      type: "tool",
      id: event.toolCallId,
      producer: producerFor(event.subagentRunId),
      name: event.toolCallName,
      status: "preparing",
      arguments: "",
      ...(event.parentMessageId === undefined
        ? {}
        : { parentMessageId: event.parentMessageId }),
    };
    this.upsertExecution(execution);
  }

  onToolCallArgs(event: ToolCallArgsEvent): void {
    this.reactivateProducer(producerFor(event.subagentRunId));
    this.updateExecution("tool", event.toolCallId, (execution) =>
      isActive(execution)
        ? {
            ...execution,
            arguments: execution.arguments + event.delta,
            status: "preparing",
          }
        : execution);
  }

  onToolCallEnd(event: ToolCallEndEvent): void {
    this.reactivateProducer(producerFor(event.subagentRunId));
    this.updateExecution("tool", event.toolCallId, (execution) =>
      isActive(execution)
        ? { ...execution, status: "awaiting-result" }
        : execution);
  }

  onToolCallResult(event: ToolCallResultEvent): void {
    this.reactivateProducer(producerFor(event.subagentRunId));
    this.messageProducers.set(
      event.messageId,
      producerFor(event.subagentRunId),
    );
    this.updateExecution("tool", event.toolCallId, (execution) => ({
      ...execution,
      status: "completed",
      result: { messageId: event.messageId, content: event.content },
    }));
  }

  onReasoningStart(event: ReasoningStartEvent): void {
    const producer = producerFor(event.subagentRunId);
    this.reactivateProducer(producer);
    const execution: AgentReasoningExecution = {
      type: "reasoning",
      id: event.messageId,
      producer,
      status: "running",
      messageIds: [],
    };
    this.upsertExecution(execution);
    this.activeReasoningByProducer.set(producerKey(producer), execution.id);
  }

  onReasoningMessageStart(event: ReasoningMessageStartEvent): void {
    const producer = producerFor(event.subagentRunId);
    this.markMessageStreaming(event.messageId, event.subagentRunId);
    const executionId = this.activeReasoningByProducer.get(producerKey(producer));
    if (executionId === undefined) return;
    this.updateExecution("reasoning", executionId, (execution) => ({
      ...execution,
      messageIds: execution.messageIds.includes(event.messageId)
        ? execution.messageIds
        : [...execution.messageIds, event.messageId],
    }));
  }

  onReasoningMessageContent(event: ReasoningMessageContentEvent): void {
    this.markMessageStreaming(event.messageId, event.subagentRunId);
  }

  onReasoningMessageEnd(event: ReasoningMessageEndEvent): void {
    this.completeMessageStream(event.messageId, event.subagentRunId);
  }

  onReasoningEnd(event: ReasoningEndEvent): void {
    const producer = producerFor(event.subagentRunId);
    this.reactivateProducer(producer);
    this.updateExecution("reasoning", event.messageId, (execution) => ({
      ...execution,
      status: "completed",
    }));
    const key = producerKey(producer);
    if (this.activeReasoningByProducer.get(key) === event.messageId) {
      this.activeReasoningByProducer.delete(key);
    }
  }

  onStepStarted(event: StepStartedEvent): void {
    const producer = producerFor(event.subagentRunId);
    this.reactivateProducer(producer);
    const execution: AgentStepExecution = {
      type: "step",
      id: `step-${crypto.randomUUID()}`,
      producer,
      name: event.stepName,
      status: "running",
    };
    this.executions = [...this.executions, execution];
    this.activeSteps.set(activeStepKey(producer, event.stepName), execution.id);
  }

  onStepFinished(event: StepFinishedEvent): void {
    const producer = producerFor(event.subagentRunId);
    this.reactivateProducer(producer);
    const key = activeStepKey(producer, event.stepName);
    const trackedExecutionId = this.activeSteps.get(key);
    let executionId = trackedExecutionId;
    if (executionId === undefined) {
      for (let index = this.executions.length - 1; index >= 0; index -= 1) {
        const execution = this.executions[index];
        if (
          execution?.type === "step" &&
          producerKey(execution.producer) === producerKey(producer) &&
          execution.name === event.stepName &&
          execution.status === "interrupted"
        ) {
          executionId = execution.id;
          break;
        }
      }
    }
    if (executionId === undefined) return;
    this.updateExecution("step", executionId, (execution) => ({
      ...execution,
      status: "completed",
    }));
    if (trackedExecutionId === executionId) {
      this.activeSteps.delete(key);
    }
  }

  onSubagentStarted(event: SubagentStartedEvent): void {
    this.reactivateProducer(producerFor(event.parentSubagentRunId));
    const execution: AgentSubagentExecution = {
      type: "subagent",
      id: event.subagentRunId,
      producer: producerFor(event.parentSubagentRunId),
      name: event.name,
      status: "running",
      ...(event.description === undefined
        ? {}
        : { description: event.description }),
      ...(event.parentSubagentRunId === undefined
        ? {}
        : { parentSubagentId: event.parentSubagentRunId }),
      ...(event.parentToolCallId === undefined
        ? {}
        : { parentToolId: event.parentToolCallId }),
      ...(event.parentMessageId === undefined
        ? {}
        : { parentMessageId: event.parentMessageId }),
    };
    this.upsertExecution(execution);
  }

  onSubagentFinished(event: SubagentFinishedEvent): void {
    this.reactivateProducer({ type: "subagent", id: event.subagentRunId });
    this.interruptSubagentTree(event.subagentRunId);
    this.updateExecution("subagent", event.subagentRunId, (execution) => ({
      ...execution,
      status: event.outcome?.type === "suspended" ? "suspended" : "completed",
    }));
  }

  onSubagentError(event: SubagentErrorEvent): void {
    this.reactivateProducer({ type: "subagent", id: event.subagentRunId });
    this.interruptSubagentTree(event.subagentRunId);
    this.updateExecution("subagent", event.subagentRunId, (execution) => ({
      ...execution,
      status: "error",
      error: {
        message: event.message,
        ...(event.code === undefined ? {} : { code: event.code }),
      },
    }));
  }

  private markMessageStreaming(messageId: string, subagentId?: string): void {
    this.reactivateProducer(producerFor(subagentId));
    this.messageStreamStatuses.set(messageId, "streaming");
    this.messageProducers.set(messageId, producerFor(subagentId));
  }

  private completeMessageStream(messageId: string, subagentId?: string): void {
    this.reactivateProducer(producerFor(subagentId));
    this.messageStreamStatuses.set(messageId, "completed");
    this.messageProducers.set(messageId, producerFor(subagentId));
  }

  private completeStreamingMessages(): void {
    for (const [messageId, status] of this.messageStreamStatuses) {
      if (status === "streaming") {
        this.messageStreamStatuses.set(messageId, "completed");
      }
    }
  }

  private reactivateProducer(producer: AgentProducer): void {
    if (!this.continuationRun || producer.type === "root") return;

    const subagentIds = new Set<string>();
    let subagentId: string | undefined = producer.id;
    while (subagentId !== undefined && !subagentIds.has(subagentId)) {
      subagentIds.add(subagentId);
      const execution = this.findExecution("subagent", subagentId);
      subagentId = execution?.producer.type === "subagent"
        ? execution.producer.id
        : undefined;
    }

    let changed = false;
    const nextExecutions = this.executions.map((execution) => {
      if (
        execution.type !== "subagent" ||
        !subagentIds.has(execution.id) ||
        (execution.status !== "suspended" && execution.status !== "interrupted")
      ) {
        return execution;
      }
      changed = true;
      return { ...execution, status: "running" as const };
    });
    if (!changed) return;

    this.executions = nextExecutions;
  }

  private interruptSubagentTree(subagentId: string): void {
    const affectedSubagentIds = new Set<string>([subagentId]);
    let changed = true;

    while (changed) {
      changed = false;
      for (const execution of this.executions) {
        if (
          execution.type === "subagent" &&
          execution.producer.type === "subagent" &&
          affectedSubagentIds.has(execution.producer.id) &&
          isActive(execution) &&
          !affectedSubagentIds.has(execution.id)
        ) {
          affectedSubagentIds.add(execution.id);
          changed = true;
        }
      }
    }

    let executionsChanged = false;
    const nextExecutions = this.executions.map((execution) => {
      if (
        execution.producer.type !== "subagent" ||
        !affectedSubagentIds.has(execution.producer.id)
      ) {
        return execution;
      }
      const next = interrupt(execution);
      executionsChanged ||= next !== execution;
      return next;
    });
    if (executionsChanged) {
      this.executions = nextExecutions;
    }

    for (const affectedSubagentId of affectedSubagentIds) {
      this.activeReasoningByProducer.delete(producerKey({
        type: "subagent",
        id: affectedSubagentId,
      }));
    }
    for (const execution of this.executions) {
      if (
        execution.type === "step" &&
        execution.producer.type === "subagent" &&
        affectedSubagentIds.has(execution.producer.id)
      ) {
        this.activeSteps.delete(activeStepKey(
          execution.producer,
          execution.name,
        ));
      }
    }
    for (const [messageId, producer] of this.messageProducers) {
      if (
        producer.type === "subagent" &&
        affectedSubagentIds.has(producer.id) &&
        this.messageStreamStatuses.get(messageId) === "streaming"
      ) {
        this.messageStreamStatuses.set(messageId, "completed");
      }
    }
  }

  private findExecution<TType extends AgentExecution["type"]>(
    type: TType,
    id: string,
  ): Extract<AgentExecution, { type: TType }> | undefined {
    return this.executions.find(
      (execution): execution is Extract<AgentExecution, { type: TType }> =>
        execution.type === type && execution.id === id,
    );
  }

  private upsertExecution(execution: AgentExecution): void {
    const index = this.executions.findIndex(
      (current) => current.type === execution.type && current.id === execution.id,
    );
    if (index === -1) {
      this.executions = [...this.executions, execution];
      return;
    }
    this.executions = this.executions.map((current, currentIndex) =>
      currentIndex === index ? execution : current);
  }

  private updateExecution<TType extends AgentExecution["type"]>(
    type: TType,
    id: string,
    update: (
      execution: Extract<AgentExecution, { type: TType }>,
    ) => Extract<AgentExecution, { type: TType }>,
  ): void {
    const index = this.executions.findIndex(
      (execution) => execution.type === type && execution.id === id,
    );
    if (index === -1) return;
    const current = this.executions[index];
    if (current?.type !== type) return;
    const next = update(current as Extract<AgentExecution, { type: TType }>);
    if (next === current) {
      return;
    }
    this.executions = this.executions.map((execution, currentIndex) =>
      currentIndex === index ? next : execution);
  }
}
