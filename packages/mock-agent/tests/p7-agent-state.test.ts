import {
  EventSchemas,
  EventType,
  type AGUIEvent,
  type RunAgentInput,
} from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import { agentStateSyncScenario } from "../src/builtins/agent-state-sync.js";
import { runMockScenario } from "../src/scenario-runner.js";

const input: RunAgentInput = {
  threadId: "state-thread",
  runId: "state-run",
  state: {},
  messages: [],
  tools: [],
  context: [],
  forwardedProps: {},
};

async function collectScenarioEvents(
  runInput = input,
): Promise<AGUIEvent[]> {
  const events: AGUIEvent[] = [];
  for await (const event of runMockScenario(
    runInput,
    agentStateSyncScenario,
    { timingScale: 0 },
  )) {
    events.push(event);
  }
  return events;
}

describe("AG-UI State → Job Progress showcase", () => {
  it("anchors the live state updates to a running ToolCall", async () => {
    const events = await collectScenarioEvents();
    const parsedEvents = events.map((event) => EventSchemas.parse(event));
    const majorTypes = new Set([
      EventType.RUN_STARTED,
      EventType.STATE_SNAPSHOT,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
      EventType.STATE_DELTA,
      EventType.TOOL_CALL_RESULT,
      EventType.RUN_FINISHED,
    ]);
    expect(parsedEvents.filter(({ type }) => majorTypes.has(type)).map(({ type }) => type))
      .toEqual([
        EventType.RUN_STARTED,
        EventType.STATE_SNAPSHOT,
        EventType.TOOL_CALL_START,
        EventType.TOOL_CALL_ARGS,
        EventType.TOOL_CALL_END,
        EventType.STATE_DELTA,
        EventType.STATE_DELTA,
        EventType.STATE_DELTA,
        EventType.STATE_DELTA,
        EventType.STATE_DELTA,
        EventType.TOOL_CALL_RESULT,
        EventType.RUN_FINISHED,
      ]);

    const textStarts = parsedEvents.filter(
      ({ type }) => type === EventType.TEXT_MESSAGE_START,
    );
    expect(textStarts).toHaveLength(1);

    const stateDeltaEvents = events.filter(
      (event): event is Extract<AGUIEvent, { type: EventType.STATE_DELTA }> =>
        event.type === EventType.STATE_DELTA,
    );
    for (const event of stateDeltaEvents) {
      expect(Object.keys(event).sort()).toEqual(["delta", "type"]);
      expect("subagentRunId" in event ? event.subagentRunId : undefined)
        .toBeUndefined();
    }

    const snapshot = parsedEvents.find(
      (event): event is Extract<AGUIEvent, { type: EventType.STATE_SNAPSHOT }> =>
        event.type === EventType.STATE_SNAPSHOT,
    );
    expect(snapshot?.snapshot).toEqual({
      jobs: {
        "ci-job-1": {
          stageIndex: 0,
          stageProgress: 0.1,
          eta: "about 4 min",
        },
      },
    });

    const toolStartIndex = events.findIndex(({ type }) => type === EventType.TOOL_CALL_START);
    const toolArgsIndex = events.findIndex(({ type }) => type === EventType.TOOL_CALL_ARGS);
    const toolEndIndex = events.findIndex(({ type }) => type === EventType.TOOL_CALL_END);
    const deltaIndexes = events.flatMap((event, index) =>
      event.type === EventType.STATE_DELTA ? [index] : [],
    );
    const toolResultIndex = events.findIndex(({ type }) => type === EventType.TOOL_CALL_RESULT);
    expect(toolStartIndex).toBeGreaterThan(-1);
    expect(toolArgsIndex).toBeGreaterThan(toolStartIndex);
    expect(toolEndIndex).toBeGreaterThan(toolArgsIndex);
    expect(deltaIndexes).toHaveLength(5);
    expect(toolResultIndex).toBeGreaterThan(deltaIndexes[4]!);

    expect(events[toolStartIndex]).toMatchObject({
      toolCallId: "ci-job-1",
      toolCallName: "run_ci_job",
    });
    expect(JSON.parse(String((events[toolArgsIndex] as { delta: string }).delta))).toEqual({
      target: "Verify the current change on CI",
      stages: [
        { name: "clone", weight: 1 },
        { name: "install", weight: 3 },
        { name: "build", weight: 3 },
        { name: "test", weight: 3 },
      ],
    });
    expect(events[toolEndIndex]).toMatchObject({ toolCallId: "ci-job-1" });
    expect(events[toolResultIndex]).toMatchObject({
      toolCallId: "ci-job-1",
      content: JSON.stringify({
        success: true,
        summary: "All CI stages passed",
      }),
    });

    expect(stateDeltaEvents.map(({ delta }) => delta)).toEqual([
      [
        {
          op: "replace",
          path: "/jobs/ci-job-1/stageProgress",
          value: 0.7,
        },
        {
          op: "replace",
          path: "/jobs/ci-job-1/eta",
          value: "about 3 min",
        },
      ],
      [
        { op: "replace", path: "/jobs/ci-job-1/stageIndex", value: 1 },
        { op: "replace", path: "/jobs/ci-job-1/stageProgress", value: 0.3 },
        { op: "replace", path: "/jobs/ci-job-1/eta", value: "about 3 min" },
      ],
      [
        { op: "replace", path: "/jobs/ci-job-1/stageIndex", value: 2 },
        { op: "replace", path: "/jobs/ci-job-1/stageProgress", value: 0.55 },
        { op: "replace", path: "/jobs/ci-job-1/eta", value: "about 2 min" },
      ],
      [
        { op: "replace", path: "/jobs/ci-job-1/stageIndex", value: 3 },
        { op: "replace", path: "/jobs/ci-job-1/stageProgress", value: 0.75 },
        { op: "replace", path: "/jobs/ci-job-1/eta", value: "less than 1 min" },
      ],
      [
        { op: "replace", path: "/jobs/ci-job-1/stageIndex", value: 4 },
        { op: "replace", path: "/jobs/ci-job-1/stageProgress", value: 0 },
      ],
    ]);
  });

  it("does not repeat initialState as a snapshot on resume", async () => {
    const events = await collectScenarioEvents({
      ...input,
      resume: [{ interruptId: "resume", status: "resolved", payload: true }],
    });

    expect(events.some(({ type }) => type === EventType.STATE_SNAPSHOT)).toBe(false);
  });
});
