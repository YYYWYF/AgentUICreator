import { EventType, type BaseEvent, type RunAgentInput } from "@ag-ui/core";
import { describe, expect, it, vi } from "vitest";

import { runMockScenario } from "../src/scenario-runner.js";
import { defineScenario } from "../src/scenario.js";

const input: RunAgentInput = {
  threadId: "thread-1",
  runId: "run-1",
  state: {},
  messages: [],
  tools: [],
  context: [],
  forwardedProps: {},
};

describe("runMockScenario", () => {
  it("converts scenario steps into ordered standard AG-UI lifecycles", async () => {
    const scenario = defineScenario({
      id: "runner-test",
      title: "Runner Test",
      initialState: { selectedFile: "src/App.tsx" },
      steps: [
        { type: "reasoning", text: "分析", durationMs: 0 },
        {
          type: "tool",
          name: "search_files",
          args: { keyword: "AG-UI" },
          result: { files: ["AgUiTransport.ts"] },
          prepareDurationMs: 0,
          durationMs: 0,
        },
        { type: "message", text: "完成", intervalMs: 0 },
      ],
    });
    const events: BaseEvent[] = [];
    let nextId = 0;

    for await (const event of runMockScenario(input, scenario, {
      createId: (prefix) => `${prefix}-${++nextId}`,
    })) {
      events.push(event);
    }

    expect(events.map(({ type }) => type)).toEqual([
      EventType.RUN_STARTED,
      EventType.STATE_SNAPSHOT,
      EventType.REASONING_START,
      EventType.REASONING_MESSAGE_START,
      EventType.REASONING_MESSAGE_CONTENT,
      EventType.REASONING_MESSAGE_CONTENT,
      EventType.REASONING_MESSAGE_END,
      EventType.REASONING_END,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
      EventType.TOOL_CALL_RESULT,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(events[0]).toMatchObject({
      threadId: "thread-1",
      runId: "run-1",
    });
    expect(events[1]).toMatchObject({
      snapshot: { selectedFile: "src/App.tsx" },
    });
    expect(events.slice(8, 12)).toMatchObject([
      { toolCallId: "tool-call-3", toolCallName: "search_files" },
      { toolCallId: "tool-call-3", delta: '{"keyword":"AG-UI"}' },
      { toolCallId: "tool-call-3" },
      {
        messageId: "tool-result-4",
        toolCallId: "tool-call-3",
        content: '{"files":["AgUiTransport.ts"]}',
      },
    ]);
  });

  it("emits cloned root and subagent CUSTOM events without validating them", async () => {
    const value = { id: "artifact-1", nested: { ready: true } };
    const scenario = defineScenario({
      id: "custom-events",
      title: "Custom Events",
      steps: [
        {
          type: "custom",
          name: "artifact.created",
          value,
          delayMs: 0,
        },
        {
          type: "custom",
          name: "unknown backend event",
          value: "raw-value",
          subagentRunId: "researcher-1",
        },
      ],
    });
    const events: BaseEvent[] = [];

    for await (const event of runMockScenario(input, scenario)) {
      events.push(event);
    }
    value.nested.ready = false;

    expect(events.slice(1, 3)).toEqual([
      {
        type: EventType.CUSTOM,
        name: "artifact.created",
        value: { id: "artifact-1", nested: { ready: true } },
      },
      {
        type: EventType.CUSTOM,
        name: "unknown backend event",
        value: "raw-value",
        subagentRunId: "researcher-1",
      },
    ]);
  });

  it("honors a custom step delay", async () => {
    vi.useFakeTimers();
    try {
      const iterator = runMockScenario(input, defineScenario({
        id: "delayed-custom-event",
        title: "Delayed Custom Event",
        steps: [{
          type: "custom",
          name: "artifact.created",
          value: { id: "artifact-1" },
          delayMs: 25,
        }],
      }));

      await iterator.next();
      const pendingEvent = iterator.next();
      await vi.advanceTimersByTimeAsync(25);

      expect(await pendingEvent).toEqual({
        done: false,
        value: {
          type: EventType.CUSTOM,
          name: "artifact.created",
          value: { id: "artifact-1" },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops when aborted during a custom step delay", async () => {
    const controller = new AbortController();
    const iterator = runMockScenario(input, defineScenario({
      id: "aborted-custom-event",
      title: "Aborted Custom Event",
      steps: [{
        type: "custom",
        name: "artifact.created",
        value: { id: "artifact-1" },
        delayMs: 1_000,
      }],
    }), { signal: controller.signal });

    await iterator.next();
    const pendingEvent = iterator.next();
    controller.abort();

    expect(await pendingEvent).toEqual({ done: true, value: undefined });
  });
});
