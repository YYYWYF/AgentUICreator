import type {
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallResultEvent,
  ToolCallStartEvent,
} from "@ag-ui/core";
import type {
  AgentFrontendToolCall,
  AgentFrontendToolDefinition,
} from "@agent-ui/runtime-core";

interface PendingFrontendToolCall {
  call: Omit<AgentFrontendToolCall, "input">;
  rawArguments: string;
  ended: boolean;
  serverResultObserved: boolean;
}

export interface CollectedFrontendToolCall {
  call: Omit<AgentFrontendToolCall, "input">;
  rawArguments: string;
}

/** Internal wire-run state for frontend-advertised standard AG-UI tools. */
export class FrontendToolCoordinator {
  readonly #handledToolCallIds = new Set<string>();
  #advertisedToolNames = new Set<string>();
  #serverResultToolCallIds = new Set<string>();
  #pendingById = new Map<string, PendingFrontendToolCall>();
  #callOrder: string[] = [];

  startWireRun(definitions: readonly AgentFrontendToolDefinition[]): void {
    this.#advertisedToolNames = new Set(
      definitions.map((definition) => definition.name),
    );
    this.#pendingById.clear();
    this.#serverResultToolCallIds.clear();
    this.#callOrder = [];
  }

  resetLogicalChain(): void {
    this.#handledToolCallIds.clear();
    this.discardWireRun();
  }

  discardWireRun(): void {
    this.#advertisedToolNames.clear();
    this.#serverResultToolCallIds.clear();
    this.#pendingById.clear();
    this.#callOrder = [];
  }

  onToolCallStart(event: ToolCallStartEvent): void {
    if (
      !this.#advertisedToolNames.has(event.toolCallName) ||
      this.#handledToolCallIds.has(event.toolCallId) ||
      this.#pendingById.has(event.toolCallId)
    ) {
      return;
    }

    this.#pendingById.set(event.toolCallId, {
      call: {
        id: event.toolCallId,
        name: event.toolCallName,
        producer: event.subagentRunId === undefined
          ? { type: "root" }
          : { type: "subagent", id: event.subagentRunId },
        ...(event.parentMessageId === undefined
          ? {}
          : { parentMessageId: event.parentMessageId }),
      },
      rawArguments: "",
      ended: false,
      serverResultObserved: this.#serverResultToolCallIds.has(event.toolCallId),
    });
    this.#callOrder.push(event.toolCallId);
  }

  onToolCallArgs(event: ToolCallArgsEvent): void {
    const pending = this.#pendingById.get(event.toolCallId);
    if (pending === undefined || pending.ended) return;
    pending.rawArguments += event.delta;
  }

  onToolCallEnd(event: ToolCallEndEvent): void {
    const pending = this.#pendingById.get(event.toolCallId);
    if (pending !== undefined) {
      pending.ended = true;
    }
  }

  onToolCallResult(event: ToolCallResultEvent): void {
    this.#serverResultToolCallIds.add(event.toolCallId);
    const pending = this.#pendingById.get(event.toolCallId);
    if (pending !== undefined) {
      pending.serverResultObserved = true;
    }
  }

  finishSuccessfulWireRun(): CollectedFrontendToolCall[] {
    const collected = this.#callOrder.flatMap((toolCallId) => {
      const pending = this.#pendingById.get(toolCallId);
      if (
        pending === undefined ||
        !pending.ended ||
        pending.serverResultObserved ||
        this.#handledToolCallIds.has(toolCallId)
      ) {
        return [];
      }

      this.#handledToolCallIds.add(toolCallId);
      return [{
        call: pending.call,
        rawArguments: pending.rawArguments,
      }];
    });

    this.discardWireRun();
    return collected;
  }
}
