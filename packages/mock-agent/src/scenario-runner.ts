import {
  EventType,
  type AGUIEvent,
  type RunAgentInput,
} from "@ag-ui/core";

import {
  validateMockScenario,
  type MockParallelTool,
  type MockScenario,
  type MockScenarioStep,
} from "./scenario.js";

const DEFAULT_REASONING_DURATION_MS = 600;
const DEFAULT_TOOL_PREPARE_DURATION_MS = 400;
const DEFAULT_TOOL_DURATION_MS = 800;
const DEFAULT_MESSAGE_INTERVAL_MS = 30;
const DEFAULT_SUBAGENT_DURATION_MS = 800;

export interface MockScenarioRunnerOptions {
  signal?: AbortSignal | undefined;
  createId?: ((prefix: string) => string) | undefined;
  timingScale?: number | undefined;
}

interface RunStepContext {
  subagentRunId?: string | undefined;
}

interface ScheduledEvent {
  offset: number;
  phase: number;
  index: number;
  event: AGUIEvent;
}

function normalizeDelay(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value ?? fallback) : fallback;
}

function normalizeTimingScale(value: number | undefined): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(10, Math.max(0, value ?? 1));
}

function serializeToolValue(value: unknown): string {
  if (typeof value === "string") return value;
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

function serializeToolArgs(args: Record<string, unknown>): string {
  const serialized = JSON.stringify(args);
  if (serialized === undefined) {
    throw new Error("Mock Tool args must be JSON-serializable.");
  }
  return serialized;
}

function withSubagentRunId<T extends Record<string, unknown>>(
  event: T,
  subagentRunId: string | undefined,
): T & Record<string, unknown> {
  return subagentRunId === undefined
    ? event
    : { ...event, subagentRunId };
}

async function waitForDelay(
  durationMs: number,
  signal: AbortSignal | undefined,
  timingScale: number,
): Promise<boolean> {
  if (signal?.aborted) return false;
  const scaledDurationMs = durationMs * timingScale;
  if (scaledDurationMs <= 0) return true;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, scaledDurationMs);
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve(false);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function* streamText(
  type: EventType.REASONING_MESSAGE_CONTENT | EventType.TEXT_MESSAGE_CONTENT,
  messageId: string,
  text: string,
  intervalMs: number,
  signal: AbortSignal | undefined,
  timingScale: number,
  subagentRunId: string | undefined,
): AsyncGenerator<AGUIEvent> {
  for (const delta of [...text]) {
    if (!await waitForDelay(intervalMs, signal, timingScale)) return;
    yield withSubagentRunId(
      type === EventType.REASONING_MESSAGE_CONTENT
        ? { type: EventType.REASONING_MESSAGE_CONTENT, messageId, delta }
        : { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta },
      subagentRunId,
    ) as AGUIEvent;
  }
}

function makeToolCallEvents(
  tool: MockParallelTool,
  toolCallId: string,
  resultMessageId: string,
  subagentRunId: string | undefined,
): ScheduledEvent[] {
  const startOffset = normalizeDelay(tool.startDelayMs, 0);
  const endOffset = startOffset + normalizeDelay(
    tool.prepareDurationMs,
    DEFAULT_TOOL_PREPARE_DURATION_MS,
  );
  const resultOffset = endOffset + normalizeDelay(
    tool.durationMs,
    DEFAULT_TOOL_DURATION_MS,
  );
  const event = (value: Record<string, unknown>): AGUIEvent =>
    withSubagentRunId(value, subagentRunId) as AGUIEvent;

  return [
    {
      offset: startOffset,
      phase: 0,
      index: 0,
      event: event({
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: tool.name,
      }),
    },
    {
      offset: startOffset,
      phase: 1,
      index: 0,
      event: event({
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: serializeToolArgs(tool.args),
      }),
    },
    {
      offset: endOffset,
      phase: 2,
      index: 0,
      event: event({ type: EventType.TOOL_CALL_END, toolCallId }),
    },
    {
      offset: resultOffset,
      phase: 3,
      index: 0,
      event: event({
        type: EventType.TOOL_CALL_RESULT,
        messageId: resultMessageId,
        toolCallId,
        content: serializeToolValue(tool.result),
        role: "tool",
      }),
    },
  ];
}

async function* runSteps(
  input: RunAgentInput,
  steps: readonly MockScenarioStep[],
  createId: (prefix: string) => string,
  signal: AbortSignal | undefined,
  timingScale: number,
  context: RunStepContext = {},
): AsyncGenerator<AGUIEvent> {
  for (const step of steps) {
    if (signal?.aborted) return;

    if (step.type === "reasoning") {
      const reasoningId = createId("reasoning");
      const messageId = createId("reasoning-message");
      const characters = [...step.text];
      const durationMs = normalizeDelay(
        step.durationMs,
        DEFAULT_REASONING_DURATION_MS,
      );
      const intervalMs = characters.length === 0
        ? 0
        : durationMs / characters.length;

      yield withSubagentRunId(
        { type: EventType.REASONING_START, messageId: reasoningId },
        context.subagentRunId,
      ) as AGUIEvent;
      yield withSubagentRunId(
        {
          type: EventType.REASONING_MESSAGE_START,
          messageId,
          role: "reasoning",
        },
        context.subagentRunId,
      ) as AGUIEvent;
      yield* streamText(
        EventType.REASONING_MESSAGE_CONTENT,
        messageId,
        step.text,
        intervalMs,
        signal,
        timingScale,
        context.subagentRunId,
      );
      if (signal?.aborted) return;
      yield withSubagentRunId(
        { type: EventType.REASONING_MESSAGE_END, messageId },
        context.subagentRunId,
      ) as AGUIEvent;
      yield withSubagentRunId(
        { type: EventType.REASONING_END, messageId: reasoningId },
        context.subagentRunId,
      ) as AGUIEvent;
      continue;
    }

    if (step.type === "tool") {
      const toolCallId = step.toolCallId ?? createId("tool-call");
      const resultMessageId = createId("tool-result");
      const attributedEvent = (value: Record<string, unknown>): AGUIEvent =>
        withSubagentRunId(value, context.subagentRunId) as AGUIEvent;
      const runEvent = (value: Record<string, unknown>): AGUIEvent =>
        value as AGUIEvent;
      yield attributedEvent({
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: step.name,
      });
      yield attributedEvent({
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: serializeToolArgs(step.args),
      });
      if (!await waitForDelay(
        normalizeDelay(
          step.prepareDurationMs,
          DEFAULT_TOOL_PREPARE_DURATION_MS,
        ),
        signal,
        timingScale,
      )) return;
      yield attributedEvent({ type: EventType.TOOL_CALL_END, toolCallId });
      if (step.during !== undefined) {
        yield* runSteps(
          input,
          step.during,
          createId,
          signal,
          timingScale,
          context,
        );
        if (signal?.aborted) return;
      }
      if (!await waitForDelay(
        normalizeDelay(step.durationMs, DEFAULT_TOOL_DURATION_MS),
        signal,
        timingScale,
      )) return;
      if (step.error !== undefined) {
        yield runEvent({
          type: EventType.RUN_ERROR,
          message: step.error.message,
          ...(step.error.code === undefined ? {} : { code: step.error.code }),
        });
        return;
      }
      yield attributedEvent({
        type: EventType.TOOL_CALL_RESULT,
        messageId: resultMessageId,
        toolCallId,
        content: serializeToolValue(step.result),
        role: "tool",
      });
      continue;
    }

    if (step.type === "tool-result") {
      // tool-result is used to deliver a result for an already closed ToolCall,
      // including a cross-run result after an interrupt resume.
      const attributedEvent = (value: Record<string, unknown>): AGUIEvent =>
        withSubagentRunId(value, context.subagentRunId) as AGUIEvent;
      const runEvent = (value: Record<string, unknown>): AGUIEvent =>
        value as AGUIEvent;
      if (!await waitForDelay(
        normalizeDelay(step.durationMs, DEFAULT_TOOL_DURATION_MS),
        signal,
        timingScale,
      )) return;
      if (step.error !== undefined) {
        yield runEvent({
          type: EventType.RUN_ERROR,
          message: step.error.message,
          ...(step.error.code === undefined ? {} : { code: step.error.code }),
        });
        return;
      }
      yield attributedEvent({
        type: EventType.TOOL_CALL_RESULT,
        messageId: createId("tool-result"),
        toolCallId: step.toolCallId,
        content: serializeToolValue(step.result),
        role: "tool",
      });
      continue;
    }

    if (step.type === "parallel-tools") {
      const scheduled = step.tools.flatMap((tool, index) => {
        const toolCallId = tool.id ?? createId("tool-call");
        const resultMessageId = createId("tool-result");
        return makeToolCallEvents(
          tool,
          toolCallId,
          resultMessageId,
          context.subagentRunId,
        ).map((entry) => ({ ...entry, index }));
      }).sort((left, right) =>
        left.offset - right.offset || left.phase - right.phase ||
        left.index - right.index
      );
      let cursor = 0;
      for (const scheduledEvent of scheduled) {
        if (!await waitForDelay(
          scheduledEvent.offset - cursor,
          signal,
          timingScale,
        )) return;
        cursor = scheduledEvent.offset;
        yield scheduledEvent.event;
      }
      continue;
    }

    if (step.type === "step") {
      const event = (value: Record<string, unknown>): AGUIEvent =>
        withSubagentRunId(value, context.subagentRunId) as AGUIEvent;
      yield event({ type: EventType.STEP_STARTED, stepName: step.name });
      if (!await waitForDelay(
        normalizeDelay(step.durationMs, DEFAULT_TOOL_DURATION_MS),
        signal,
        timingScale,
      )) return;
      yield event({ type: EventType.STEP_FINISHED, stepName: step.name });
      continue;
    }

    if (step.type === "state-delta") {
      if (!await waitForDelay(
        normalizeDelay(step.delayMs, 0),
        signal,
        timingScale,
      )) return;
      yield withSubagentRunId({
        type: EventType.STATE_DELTA,
        delta: structuredClone(step.delta),
      }, context.subagentRunId) as AGUIEvent;
      continue;
    }

    if (step.type === "subagent") {
      yield {
        type: EventType.SUBAGENT_STARTED,
        subagentRunId: step.id,
        name: step.name,
        ...(step.description === undefined
          ? {}
          : { description: step.description }),
        ...(context.subagentRunId === undefined
          ? {}
          : { parentSubagentRunId: context.subagentRunId }),
      } as AGUIEvent;
      if (step.steps !== undefined) {
        yield* runSteps(
          input,
          step.steps,
          createId,
          signal,
          timingScale,
          { subagentRunId: step.id },
        );
      } else if (!await waitForDelay(
        normalizeDelay(step.durationMs, DEFAULT_SUBAGENT_DURATION_MS),
        signal,
        timingScale,
      )) return;
      if (signal?.aborted) return;
      if (step.outcome.type === "error") {
        yield {
          type: EventType.SUBAGENT_ERROR,
          subagentRunId: step.id,
          message: step.outcome.message,
          ...(step.outcome.code === undefined
            ? {}
            : { code: step.outcome.code }),
        } as AGUIEvent;
      } else {
        yield {
          type: EventType.SUBAGENT_FINISHED,
          subagentRunId: step.id,
          ...(step.outcome.result === undefined
            ? {}
            : { result: structuredClone(step.outcome.result) }),
          outcome: { type: "success" },
        } as AGUIEvent;
      }
      continue;
    }

    if (step.type === "subagent-tool") {
      const resultMessageId = createId("tool-result");
      const event = (value: Record<string, unknown>): AGUIEvent =>
        withSubagentRunId(value, context.subagentRunId) as AGUIEvent;
      yield event({
        type: EventType.TOOL_CALL_START,
        toolCallId: step.toolCallId,
        toolCallName: step.toolName,
      });
      yield event({
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: step.toolCallId,
        delta: serializeToolArgs(step.args),
      });
      if (!await waitForDelay(
        normalizeDelay(
          step.prepareDurationMs,
          DEFAULT_TOOL_PREPARE_DURATION_MS,
        ),
        signal,
        timingScale,
      )) return;
      yield event({ type: EventType.TOOL_CALL_END, toolCallId: step.toolCallId });
      yield {
        type: EventType.SUBAGENT_STARTED,
        subagentRunId: step.subagent.id,
        name: step.subagent.name,
        ...(step.subagent.description === undefined
          ? {}
          : { description: step.subagent.description }),
        parentToolCallId: step.toolCallId,
        ...(context.subagentRunId === undefined
          ? {}
          : { parentSubagentRunId: context.subagentRunId }),
      } as AGUIEvent;
      yield* runSteps(
        input,
        step.subagent.steps,
        createId,
        signal,
        timingScale,
        { subagentRunId: step.subagent.id },
      );
      if (signal?.aborted) return;
      if (step.subagent.outcome.type === "error") {
        yield {
          type: EventType.SUBAGENT_ERROR,
          subagentRunId: step.subagent.id,
          message: step.subagent.outcome.message,
          ...(step.subagent.outcome.code === undefined
            ? {}
            : { code: step.subagent.outcome.code }),
        } as AGUIEvent;
      } else {
        yield {
          type: EventType.SUBAGENT_FINISHED,
          subagentRunId: step.subagent.id,
          ...(step.subagent.outcome.result === undefined
            ? {}
            : { result: structuredClone(step.subagent.outcome.result) }),
          outcome: { type: "success" },
        } as AGUIEvent;
      }
      yield event({
        type: EventType.TOOL_CALL_RESULT,
        messageId: resultMessageId,
        toolCallId: step.toolCallId,
        content: serializeToolValue(step.result),
        role: "tool",
      });
      continue;
    }

    if (step.type === "interrupt") {
      const event = (value: Record<string, unknown>): AGUIEvent =>
        withSubagentRunId(value, context.subagentRunId) as AGUIEvent;
      yield event({
        type: EventType.TOOL_CALL_START,
        toolCallId: step.toolCallId,
        toolCallName: step.toolName,
      });
      yield event({
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: step.toolCallId,
        delta: serializeToolArgs(step.args),
      });
      yield event({ type: EventType.TOOL_CALL_END, toolCallId: step.toolCallId });
      yield {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
        outcome: {
          type: "interrupt",
          interrupts: [{
            ...structuredClone(step.interrupt),
            ...(step.interrupt.toolCallId === undefined
              ? { toolCallId: step.toolCallId }
              : {}),
          }],
        },
      } as AGUIEvent;
      return;
    }

    if (step.type === "custom") {
      if (!await waitForDelay(
        normalizeDelay(step.delayMs, 0),
        signal,
        timingScale,
      )) return;
      yield {
        type: EventType.CUSTOM,
        name: step.name,
        value: structuredClone(step.value),
        ...(step.subagentRunId === undefined
          ? context.subagentRunId === undefined
            ? {}
            : { subagentRunId: context.subagentRunId }
          : { subagentRunId: step.subagentRunId }),
      } as AGUIEvent;
      continue;
    }

    const messageId = createId("assistant-message");
    yield withSubagentRunId(
      { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" },
      context.subagentRunId,
    ) as AGUIEvent;
    yield* streamText(
      EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      step.text,
      normalizeDelay(step.intervalMs, DEFAULT_MESSAGE_INTERVAL_MS),
      signal,
      timingScale,
      context.subagentRunId,
    );
    if (signal?.aborted) return;
    yield withSubagentRunId(
      { type: EventType.TEXT_MESSAGE_END, messageId },
      context.subagentRunId,
    ) as AGUIEvent;
  }
}

type MockScenarioResumeBranch = "approved" | "denied" | "cancelled";

function selectResumeBranch(input: RunAgentInput): MockScenarioResumeBranch {
  const response = input.resume?.[0];
  if (response?.status !== "resolved") return "cancelled";

  const payload = response.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return "cancelled";
  }
  if (!("approved" in payload)) return "cancelled";
  if (payload.approved === true) return "approved";
  if (payload.approved === false) return "denied";
  return "cancelled";
}

function selectSteps(
  input: RunAgentInput,
  scenario: MockScenario,
): readonly MockScenarioStep[] {
  if ((input.resume?.length ?? 0) === 0 || scenario.resumeSteps === undefined) {
    return scenario.steps;
  }

  if (Array.isArray(scenario.resumeSteps)) return scenario.resumeSteps;
  return scenario.resumeSteps[selectResumeBranch(input)];
}

/** Converts a high-level scenario into the same standard AG-UI events as a backend. */
export async function* runMockScenario(
  input: RunAgentInput,
  scenario: MockScenario,
  options: MockScenarioRunnerOptions = {},
): AsyncGenerator<AGUIEvent> {
  validateMockScenario(scenario);
  let sequence = 0;
  const createId = options.createId
    ?? ((prefix: string) => `${input.runId}:${prefix}:${++sequence}`);
  const { signal } = options;
  const timingScale = normalizeTimingScale(options.timingScale);
  const isResume = (input.resume?.length ?? 0) > 0;

  yield {
    type: EventType.RUN_STARTED,
    threadId: input.threadId,
    runId: input.runId,
  };

  if (!isResume && scenario.initialState !== undefined) {
    yield {
      type: EventType.STATE_SNAPSHOT,
      snapshot: structuredClone(scenario.initialState),
    };
  }

  for await (const event of runSteps(
    input,
    selectSteps(input, scenario),
    createId,
    signal,
    timingScale,
  )) {
    if (signal?.aborted) return;
    yield event;
    if (
      event.type === EventType.RUN_ERROR ||
      event.type === EventType.RUN_FINISHED
    ) {
      return;
    }
  }

  if (signal?.aborted) return;
  yield {
    type: EventType.RUN_FINISHED,
    threadId: input.threadId,
    runId: input.runId,
    outcome: { type: "success" },
  };
}
