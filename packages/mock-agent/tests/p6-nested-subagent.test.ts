import {
  EventSchemas,
  EventType,
  type BaseEvent,
  type RunAgentInput,
} from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import { nestedSubagentConversationScenario } from "../src/builtins/index.js";
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
      EventType.SUBAGENT_STARTED,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
      EventType.TOOL_CALL_RESULT,
      EventType.SUBAGENT_FINISHED,
      EventType.TOOL_CALL_RESULT,
      EventType.TOOL_CALL_END,
    ]);

    expect(lifecycle[0]).toMatchObject({
      type: EventType.TOOL_CALL_START,
      toolCallId: "invoke-researcher-1",
      toolCallName: "delegate_specialist",
    });
    expect(lifecycle[2]).toMatchObject({
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: "researcher-1",
      parentToolCallId: "invoke-researcher-1",
      name: "Architecture Researcher",
    });
    expect(lifecycle[7]).toMatchObject({
      type: EventType.SUBAGENT_FINISHED,
      subagentRunId: "researcher-1",
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
});
