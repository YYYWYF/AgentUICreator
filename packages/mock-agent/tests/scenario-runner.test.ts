import { EventType, type BaseEvent, type RunAgentInput } from "@ag-ui/core";
import { describe, expect, it } from "vitest";

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
});
