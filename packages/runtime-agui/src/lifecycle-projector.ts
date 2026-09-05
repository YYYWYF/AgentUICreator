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
  AgentMessageStreamStatus,
  AgentProducer,
  AgentReasoningExecution,
  AgentStepExecution,
  AgentSubagentExecution,
  AgentToolExecution,
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
  private readonly messageStreamStatuses =
    new Map<string, AgentMessageStreamStatus>();
  private readonly messageProducers = new Map<string, AgentProducer>();
  private readonly activeReasoningByProducer = new Map<string, string>();
  private readonly activeSteps = new Map<string, string>();

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

    for (const message of projected) {
      if (message.role !== "tool") continue;
      const execution = this.findExecution("tool", message.toolCallId);
      if (execution === undefined) continue;
      this.updateExecution("tool", execution.id, (current) => ({
        ...current,
        producer: message.producer,
        status: message.error === undefined ? "completed" : "error",
        result: { messageId: message.id, content: message.content },
        ...(message.error === undefined
          ? { error: undefined }
          : { error: { message: message.error } }),
      }));
    }

    return projected;
  }

  resetForRun(): void {
    this.completeStreamingMessages();
    this.executions = [];
    this.activeReasoningByProducer.clear();
    this.activeSteps.clear();
  }

  resetConversation(): void {
    this.executions = [];
    this.messageStreamStatuses.clear();
    this.messageProducers.clear();
    this.activeReasoningByProducer.clear();
    this.activeSteps.clear();
  }

  interruptActive(): void {
    let changed = false;
    const nextExecutions = this.executions.map((execution) => {
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
    this.updateExecution("tool", event.toolCallId, (execution) => ({
      ...execution,
      arguments: execution.arguments + event.delta,
      status: "preparing",
    }));
  }

  onToolCallEnd(event: ToolCallEndEvent): void {
    this.updateExecution("tool", event.toolCallId, (execution) => ({
      ...execution,
      status: "awaiting-result",
    }));
  }

  onToolCallResult(event: ToolCallResultEvent): void {
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
    const key = activeStepKey(producer, event.stepName);
    const executionId = this.activeSteps.get(key);
    if (executionId === undefined) return;
    this.updateExecution("step", executionId, (execution) => ({
      ...execution,
      status: "completed",
    }));
    this.activeSteps.delete(key);
  }

  onSubagentStarted(event: SubagentStartedEvent): void {
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
    this.updateExecution("subagent", event.subagentRunId, (execution) => ({
      ...execution,
      status: event.outcome?.type === "suspended" ? "suspended" : "completed",
    }));
  }

  onSubagentError(event: SubagentErrorEvent): void {
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
    this.messageStreamStatuses.set(messageId, "streaming");
    this.messageProducers.set(messageId, producerFor(subagentId));
  }

  private completeMessageStream(messageId: string, subagentId?: string): void {
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
    this.executions = this.executions.map((execution, currentIndex) =>
      currentIndex === index ? next : execution);
  }
}
