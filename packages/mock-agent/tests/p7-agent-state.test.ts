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
  it("emits the standard snapshot and delta protocol flow", async () => {
    const events = await collectScenarioEvents();
    const parsedEvents = events.map((event) => EventSchemas.parse(event));
    const protocolEvents = parsedEvents.filter(({ type }) => [
      EventType.RUN_STARTED,
      EventType.STATE_SNAPSHOT,
      EventType.STATE_DELTA,
      EventType.RUN_FINISHED,
    ].includes(type));

    const stateDeltaEvents = events.filter(
      (event): event is Extract<AGUIEvent, { type: EventType.STATE_DELTA }> =>
        event.type === EventType.STATE_DELTA,
    );
    for (const event of stateDeltaEvents) {
      expect(Object.keys(event).sort()).toEqual(["delta", "type"]);
      expect("subagentRunId" in event ? event.subagentRunId : undefined)
        .toBeUndefined();
    }

    expect(protocolEvents.map(({ type }) => type)).toEqual([
      EventType.RUN_STARTED,
      EventType.STATE_SNAPSHOT,
      EventType.STATE_DELTA,
      EventType.STATE_DELTA,
      EventType.STATE_DELTA,
      EventType.STATE_DELTA,
      EventType.STATE_DELTA,
      EventType.RUN_FINISHED,
    ]);
    expect(events.filter(({ type }) => type === EventType.TEXT_MESSAGE_START)).toHaveLength(2);

    const snapshots = parsedEvents.filter(
      (event): event is Extract<AGUIEvent, { type: EventType.STATE_SNAPSHOT }> =>
        event.type === EventType.STATE_SNAPSHOT,
    );
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.snapshot).toEqual({
      jobProgress: {
        id: "ci-verification",
        title: "Verify the current change on CI",
        stages: [
          { name: "clone", weight: 1 },
          { name: "install", weight: 3 },
          { name: "build", weight: 3 },
          { name: "test", weight: 3 },
        ],
        stageIndex: 0,
        stageProgress: 0.1,
        eta: "about 4 min",
      },
    });

    const deltas = parsedEvents.filter(
      (event): event is Extract<AGUIEvent, { type: EventType.STATE_DELTA }> =>
        event.type === EventType.STATE_DELTA,
    );
    expect(deltas.map(({ delta }) => delta)).toEqual([
      [
        {
          op: "replace",
          path: "/jobProgress/stageProgress",
          value: 0.7,
        },
        {
          op: "replace",
          path: "/jobProgress/eta",
          value: "about 3 min",
        },
      ],
      [
        { op: "replace", path: "/jobProgress/stageIndex", value: 1 },
        { op: "replace", path: "/jobProgress/stageProgress", value: 0.3 },
        { op: "replace", path: "/jobProgress/eta", value: "about 3 min" },
      ],
      [
        { op: "replace", path: "/jobProgress/stageIndex", value: 2 },
        { op: "replace", path: "/jobProgress/stageProgress", value: 0.55 },
        { op: "replace", path: "/jobProgress/eta", value: "about 2 min" },
      ],
      [
        { op: "replace", path: "/jobProgress/stageIndex", value: 3 },
        { op: "replace", path: "/jobProgress/stageProgress", value: 0.75 },
        { op: "replace", path: "/jobProgress/eta", value: "less than 1 min" },
      ],
      [
        { op: "replace", path: "/jobProgress/stageIndex", value: 4 },
        { op: "replace", path: "/jobProgress/stageProgress", value: 0 },
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
