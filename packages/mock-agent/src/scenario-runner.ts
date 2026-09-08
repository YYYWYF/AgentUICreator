import { randomUUID } from "node:crypto";

import {
  EventType,
  type AGUIEvent,
  type RunAgentInput,
} from "@ag-ui/core";

import type { MockScenario } from "./scenario.js";

const DEFAULT_REASONING_DURATION_MS = 600;
const DEFAULT_TOOL_PREPARE_DURATION_MS = 400;
const DEFAULT_TOOL_DURATION_MS = 800;
const DEFAULT_MESSAGE_INTERVAL_MS = 30;

export interface MockScenarioRunnerOptions {
  signal?: AbortSignal | undefined;
  createId?: ((prefix: string) => string) | undefined;
}

function normalizeDelay(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value ?? fallback) : fallback;
}

function serializeToolValue(value: unknown): string {
  if (typeof value === "string") return value;
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

async function waitForDelay(
  durationMs: number,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  if (signal?.aborted) return false;
  if (durationMs <= 0) return true;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, durationMs);
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
): AsyncGenerator<AGUIEvent> {
  for (const delta of [...text]) {
    if (!await waitForDelay(intervalMs, signal)) return;
    yield type === EventType.REASONING_MESSAGE_CONTENT
      ? { type: EventType.REASONING_MESSAGE_CONTENT, messageId, delta }
      : { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta };
  }
}

/** Converts a high-level scenario into the same standard AG-UI events as a backend. */
export async function* runMockScenario(
  input: RunAgentInput,
  scenario: MockScenario,
  options: MockScenarioRunnerOptions = {},
): AsyncGenerator<AGUIEvent> {
  const createId = options.createId
    ?? ((prefix: string) => `${prefix}-${randomUUID()}`);
  const { signal } = options;

  yield {
    type: EventType.RUN_STARTED,
    threadId: input.threadId,
    runId: input.runId,
  };

  if (scenario.initialState !== undefined) {
    yield {
      type: EventType.STATE_SNAPSHOT,
      snapshot: structuredClone(scenario.initialState),
    };
  }

  for (const step of scenario.steps) {
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

      yield { type: EventType.REASONING_START, messageId: reasoningId };
      yield {
        type: EventType.REASONING_MESSAGE_START,
        messageId,
        role: "reasoning",
      };
      yield* streamText(
        EventType.REASONING_MESSAGE_CONTENT,
        messageId,
        step.text,
        intervalMs,
        signal,
      );
      if (signal?.aborted) return;
      yield { type: EventType.REASONING_MESSAGE_END, messageId };
      yield { type: EventType.REASONING_END, messageId: reasoningId };
      continue;
    }

    if (step.type === "tool") {
      const toolCallId = createId("tool-call");
      const resultMessageId = createId("tool-result");
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: step.name,
      };
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: serializeToolValue(step.args),
      };
      if (!await waitForDelay(
        normalizeDelay(
          step.prepareDurationMs,
          DEFAULT_TOOL_PREPARE_DURATION_MS,
        ),
        signal,
      )) return;
      yield { type: EventType.TOOL_CALL_END, toolCallId };
      if (!await waitForDelay(
        normalizeDelay(step.durationMs, DEFAULT_TOOL_DURATION_MS),
        signal,
      )) return;
      yield {
        type: EventType.TOOL_CALL_RESULT,
        messageId: resultMessageId,
        toolCallId,
        content: serializeToolValue(step.result),
        role: "tool",
      };
      continue;
    }

    if (step.type === "custom") {
      if (!await waitForDelay(
        normalizeDelay(step.delayMs, 0),
        signal,
      )) return;
      yield {
        type: EventType.CUSTOM,
        name: step.name,
        value: structuredClone(step.value),
        ...(step.subagentRunId === undefined
          ? {}
          : { subagentRunId: step.subagentRunId }),
      };
      continue;
    }

    const messageId = createId("assistant-message");
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: "assistant",
    };
    yield* streamText(
      EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      step.text,
      normalizeDelay(step.intervalMs, DEFAULT_MESSAGE_INTERVAL_MS),
      signal,
    );
    if (signal?.aborted) return;
    yield { type: EventType.TEXT_MESSAGE_END, messageId };
  }

  if (signal?.aborted) return;
  yield {
    type: EventType.RUN_FINISHED,
    threadId: input.threadId,
    runId: input.runId,
    outcome: { type: "success" },
  };
}
