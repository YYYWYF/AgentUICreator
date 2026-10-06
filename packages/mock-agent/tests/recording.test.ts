import { afterEach, describe, expect, it, vi } from "vitest";
import type { AGUIEvent, RunAgentInput } from "@ag-ui/core";
import { parseMockRecording, MAX_MOCK_RECORDING_BYTES, MAX_MOCK_RECORDING_EVENTS } from "../src/recording.js";
import { runMockRecording } from "../src/recording-runner.js";
const input: RunAgentInput = { threadId: "current-thread", runId: "current-run", messages: [], state: {}, tools: [], context: [], forwardedProps: {} };
const parse = (entries: unknown[]) => parseMockRecording(entries.map(entry => JSON.stringify(entry)).join("\n"), { id: "test" });
const entry = (atMs: number, event: unknown = { type: "RUN_STARTED", threadId: "old-thread", runId: "old-run" }) => ({ atMs, event });
afterEach(() => vi.useRealTimers());

describe("local recording data and replay", () => {
  it("validates JSONL lines, schema, monotonic timestamps and limits", () => {
    expect(() => parseMockRecording("{", { id: "x" })).toThrow("Line 1");
    expect(() => parse([])).toThrow("at least one");
    for (const atMs of [-1, null, "1", 86400001]) expect(() => parse([entry(atMs as number)])).toThrow("Line 1");
    expect(() => parse([entry(1), entry(0)])).toThrow("Line 2");
    expect(() => parse([entry(0, { type: "FAKE" })])).toThrow("AG-UI");
    expect(() => parseMockRecording(" ".repeat(MAX_MOCK_RECORDING_BYTES + 1), { id: "x" })).toThrow("8 MiB");
    expect(() => parse(Array.from({ length: MAX_MOCK_RECORDING_EVENTS + 1 }, () => entry(0)))).toThrow("20,000");
    expect(parse([entry(0), entry(0)]).events).toHaveLength(2);
  });
  it("rebinds related protocol identities without touching opaque payload or the source", async () => {
    const recording = parse([
      entry(0),
      entry(0, { type: "TEXT_MESSAGE_START", messageId: "m", role: "assistant" }),
      entry(0, { type: "TOOL_CALL_START", toolCallId: "t", toolCallName: "lookup", parentMessageId: "m" }),
      entry(0, { type: "TOOL_CALL_ARGS", toolCallId: "t", delta: '{"messageId":"m"}' }),
      entry(0, { type: "SUBAGENT_STARTED", subagentRunId: "child", parentSubagentRunId: "parent", parentToolCallId: "t", parentMessageId: "m", name: "child" }),
      entry(0, { type: "SUBAGENT_STARTED", subagentRunId: "parent", name: "parent" }),
      entry(0, { type: "TOOL_CALL_END", toolCallId: "t" }),
      entry(0, { type: "TOOL_CALL_RESULT", toolCallId: "t", messageId: "result", role: "tool", content: "original" }),
      entry(0, { type: "CUSTOM", name: "opaque", value: { runId: "old-run", messageId: "m" } }),
      entry(0, { type: "MESSAGES_SNAPSHOT", messages: [{ id: "m", role: "assistant", content: "hello", toolCalls: [{ id: "t", type: "function", function: { name: "lookup", arguments: "{}" } }] }, { id: "result", role: "tool", toolCallId: "t", content: "original" }] }),
      entry(0, { type: "RUN_FINISHED", threadId: "old-thread", runId: "old-run", outcome: { type: "success" } }),
    ]);
    const source = structuredClone(recording);
    const events: AGUIEvent[] = [];
    for await (const event of runMockRecording(input, recording, { timingScale: 0 })) events.push(event);
    expect(events[0]).toMatchObject({ threadId: input.threadId, runId: input.runId });
    expect(events[2]).toMatchObject({ toolCallId: "current-run:replay:tool:1", parentMessageId: "current-run:replay:message:1" });
    expect(events[3]).toMatchObject({ toolCallId: "current-run:replay:tool:1", delta: '{"messageId":"m"}' });
    expect(events[4]).toMatchObject({ subagentRunId: "current-run:replay:subagent:1", parentSubagentRunId: "current-run:replay:subagent:2", parentToolCallId: "current-run:replay:tool:1" });
    expect(events[5]).toMatchObject({ subagentRunId: "current-run:replay:subagent:2" });
    expect(events[7]).toMatchObject({ messageId: "current-run:replay:message:2", toolCallId: "current-run:replay:tool:1" });
    expect(events[8]).toEqual(source.events[8]!.event);
    expect(events[9]).toMatchObject({ messages: [{ id: "current-run:replay:message:1", toolCalls: [{ id: "current-run:replay:tool:1" }] }, { id: "current-run:replay:message:2", toolCallId: "current-run:replay:tool:1" }] });
    expect(recording).toEqual(source);
  });
  it.each([0, 0.1, 0.5, 1, 2])("uses relative delay with timingScale %s", async scale => {
    vi.useFakeTimers();
    const stream = runMockRecording(input, parse([entry(100), entry(200)]), { timingScale: scale });
    const first = stream.next();
    await vi.advanceTimersByTimeAsync(100 * scale);
    expect((await first).value?.type).toBe("RUN_STARTED");
    let completed = false;
    const second = stream.next().then(value => { completed = true; return value; });
    if (scale) { await vi.advanceTimersByTimeAsync(100 * scale - 1); expect(completed).toBe(false); await vi.advanceTimersByTimeAsync(1); }
    expect((await second).done).toBe(false);
    expect((await stream.next()).done).toBe(true);
  });
  it("cancels during a delay and clears timers", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const stream = runMockRecording(input, parse([entry(100)]), { signal: controller.signal });
    const next = stream.next(); controller.abort();
    expect((await next).done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
