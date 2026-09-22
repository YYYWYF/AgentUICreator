import {
  EventSchemas,
  EventType,
  type BaseEvent,
  type RunAgentInput,
} from "@ag-ui/core";
import { describe, expect, it, vi } from "vitest";

import {
  nestedSubagentConversationScenario,
  nestedSubagentErrorScenario,
  nestedSubagentRecursiveScenario,
  nestedSubagentTaskGroupScenario,
} from "../src/builtins/index.js";
import { runMockScenario } from "../src/scenario-runner.js";

const input: RunAgentInput = {
  threadId: "p6-thread",
  runId: "p6-run",
  state: {},
  messages: [],
  tools: [],
  context: [],
  forwardedProps: {},
};

async function collectScenario(): Promise<BaseEvent[]> {
  const events: BaseEvent[] = [];
  for await (const event of runMockScenario(
    input,
    nestedSubagentConversationScenario,
    { timingScale: 0 },
  )) {
    events.push(EventSchemas.parse(event));
  }
  return events;
}

describe("nested subagent AG-UI reference contract", () => {
  it("creates a reachable parent tool before the subagent lifecycle", async () => {
    const events = await collectScenario();
    const lifecycle = events.filter((event) =>
      event.type === EventType.TOOL_CALL_START ||
      event.type === EventType.TOOL_CALL_ARGS ||
      event.type === EventType.TOOL_CALL_END ||
      event.type === EventType.SUBAGENT_STARTED ||
      event.type === EventType.SUBAGENT_FINISHED ||
      event.type === EventType.SUBAGENT_ERROR ||
      event.type === EventType.TOOL_CALL_RESULT,
    );

    expect(lifecycle.map(({ type }) => type)).toEqual([
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
      EventType.SUBAGENT_STARTED,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
      EventType.TOOL_CALL_RESULT,
      EventType.SUBAGENT_FINISHED,
      EventType.TOOL_CALL_RESULT,
    ]);

    expect(lifecycle[0]).toMatchObject({
      type: EventType.TOOL_CALL_START,
      toolCallId: "invoke-researcher-1",
      toolCallName: "delegate_specialist",
    });
    expect(lifecycle[2]).toMatchObject({
      type: EventType.TOOL_CALL_END,
      toolCallId: "invoke-researcher-1",
    });
    expect(lifecycle[3]).toMatchObject({
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: "researcher-1",
      parentToolCallId: "invoke-researcher-1",
      name: "Architecture Researcher",
    });
    expect(lifecycle[8]).toMatchObject({
      type: EventType.SUBAGENT_FINISHED,
      subagentRunId: "researcher-1",
    });
    expect(lifecycle[9]).toMatchObject({
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: "invoke-researcher-1",
    });
  });

  it("attributes every child event to the researcher run", async () => {
    const events = await collectScenario();
    const started = events.findIndex((event) =>
      event.type === EventType.SUBAGENT_STARTED &&
      event.subagentRunId === "researcher-1",
    );
    const finished = events.findIndex((event, index) =>
      index > started &&
      event.type === EventType.SUBAGENT_FINISHED &&
      event.subagentRunId === "researcher-1",
    );
    const childEvents = events.slice(started + 1, finished);

    expect(childEvents.length).toBeGreaterThan(0);
    expect(childEvents.every((event) =>
      "subagentRunId" in event && event.subagentRunId === "researcher-1"
    )).toBe(true);
    expect(childEvents.some(({ type }) =>
      type === EventType.REASONING_START,
    )).toBe(true);
    expect(childEvents.some(({ type }) =>
      type === EventType.REASONING_MESSAGE_CONTENT,
    )).toBe(true);
    expect(childEvents.some(({ type }) =>
      type === EventType.TEXT_MESSAGE_START,
    )).toBe(true);
    expect(childEvents.some(({ type }) =>
      type === EventType.TEXT_MESSAGE_CONTENT,
    )).toBe(true);
    expect(childEvents.some(({ type }) =>
      type === EventType.TOOL_CALL_START,
    )).toBe(true);
    expect(childEvents.some(({ type }) =>
      type === EventType.TOOL_CALL_RESULT,
    )).toBe(true);
  });

  it("keeps recursive subagent attribution attached to the child tool", async () => {
    const events = [] as BaseEvent[];
    for await (const event of runMockScenario(
      input,
      nestedSubagentRecursiveScenario,
      { timingScale: 0 },
    )) {
      events.push(EventSchemas.parse(event));
    }

    const started = events.find((event) =>
      event.type === EventType.SUBAGENT_STARTED &&
      event.subagentRunId === "subagent-b",
    );
    expect(started).toMatchObject({
      parentSubagentRunId: "subagent-a",
      parentToolCallId: "child-tool",
    });

    const childEvents = events.filter((event) =>
      "subagentRunId" in event && event.subagentRunId === "subagent-b",
    );
    expect(childEvents.some(({ type }) => type === EventType.TEXT_MESSAGE_CONTENT)).toBe(true);
    expect(childEvents.some(({ type }) => type === EventType.TOOL_CALL_RESULT)).toBe(true);
  });

  it("keeps an attributed message visible when a nested subagent errors", async () => {
    const events = [] as BaseEvent[];
    for await (const event of runMockScenario(
      input,
      nestedSubagentErrorScenario,
      { timingScale: 0 },
    )) {
      events.push(EventSchemas.parse(event));
    }

    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.SUBAGENT_ERROR,
      subagentRunId: "subagent-error",
      code: "SUBAGENT_RESEARCH_FAILED",
    }));
    expect(events.at(-1)).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: { type: "success" },
    });
  });

  it("preserves parent-to-subagent relations for every TaskGroup sibling", async () => {
    const events = [] as BaseEvent[];
    for await (const event of runMockScenario(
      input,
      nestedSubagentTaskGroupScenario,
      { timingScale: 0 },
    )) {
      events.push(EventSchemas.parse(event));
    }

    const started = events.filter((event) =>
      event.type === EventType.SUBAGENT_STARTED,
    );
    expect(started).toEqual(expect.arrayContaining([
      expect.objectContaining({
        subagentRunId: "architecture-agent",
        parentToolCallId: "architecture-tool",
      }),
      expect.objectContaining({
        subagentRunId: "runtime-agent",
        parentToolCallId: "runtime-tool",
      }),
      expect.objectContaining({
        subagentRunId: "ui-agent",
        parentToolCallId: "ui-tool",
      }),
    ]));

    for (const subagentRunId of [
      "architecture-agent",
      "runtime-agent",
      "ui-agent",
    ]) {
      expect(events.filter((event) =>
        "subagentRunId" in event && event.subagentRunId === subagentRunId,
      ).length).toBeGreaterThan(1);
    }
  });

  it("paces TaskGroup siblings and streams child progress sequentially", async () => {
    vi.useFakeTimers();
    try {
      const events: BaseEvent[] = [];
      const completed = (async () => {
        for await (const event of runMockScenario(
          input,
          nestedSubagentTaskGroupScenario,
          { timingScale: 1 },
        )) {
          events.push(EventSchemas.parse(event));
        }
      })();

      await vi.advanceTimersByTimeAsync(0);
      expect(events.map(({ type }) => type)).toEqual([
        EventType.RUN_STARTED,
        EventType.TOOL_CALL_START,
        EventType.TOOL_CALL_ARGS,
      ]);

      await vi.advanceTimersByTimeAsync(249);
      expect(events.some(({ type }) => type === EventType.SUBAGENT_STARTED)).toBe(false);
      expect(events.some(({ type }) => type === EventType.RUN_FINISHED)).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(events).toContainEqual(expect.objectContaining({
        type: EventType.SUBAGENT_STARTED,
        subagentRunId: "architecture-agent",
      }));
      expect(events.some(({ type }) => type === EventType.REASONING_START)).toBe(true);
      expect(events.some(({ type }) => type === EventType.REASONING_MESSAGE_CONTENT)).toBe(false);
      expect(events.some(({ type }) => type === EventType.RUN_FINISHED)).toBe(false);

      await vi.advanceTimersByTimeAsync(12);
      expect(events.some(({ type }) => type === EventType.REASONING_MESSAGE_CONTENT)).toBe(true);

      await vi.runAllTimersAsync();
      await completed;

      const lifecycle = events
        .map((event, index) => ({ event, index }))
        .filter(({ event }) =>
          event.type === EventType.SUBAGENT_STARTED ||
          event.type === EventType.SUBAGENT_FINISHED ||
          event.type === EventType.RUN_FINISHED,
        );
      const indexOf = (type: EventType, subagentRunId?: string): number =>
        lifecycle.find(({ event }) =>
          event.type === type &&
          (subagentRunId === undefined ||
            ("subagentRunId" in event && event.subagentRunId === subagentRunId)),
        )?.index ?? -1;

      expect(indexOf(EventType.SUBAGENT_FINISHED, "architecture-agent"))
        .toBeLessThan(indexOf(EventType.SUBAGENT_STARTED, "runtime-agent"));
      expect(indexOf(EventType.SUBAGENT_FINISHED, "runtime-agent"))
        .toBeLessThan(indexOf(EventType.SUBAGENT_STARTED, "ui-agent"));
      expect(indexOf(EventType.SUBAGENT_FINISHED, "ui-agent"))
        .toBeLessThan(indexOf(EventType.RUN_FINISHED));
    } finally {
      vi.useRealTimers();
    }
  });
});
