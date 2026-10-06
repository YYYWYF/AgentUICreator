import { afterEach, describe, expect, it, vi } from "vitest";
import { EventSchemas, EventType, type AGUIEvent, type RunAgentInput } from "@ag-ui/core";
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
  it.each([undefined, "current-parent"])("rebinds AG-UI 0.0.59 identities completely with parent %s", async parentRunId => {
    const recordedInput: RunAgentInput = {
      ...input, threadId: "old-thread", runId: "old-child", parentRunId: "old-parent",
      messages: [
        { id: "old-m", role: "assistant", subagentRunId: "old-subagent", content: "old-m old-t old-interrupt", encryptedValue: "message-signature", metadata: { messageId: "old-m" },
          toolCalls: [{ id: "old-t", type: "function", function: { name: "lookup", arguments: '{"toolCallId":"old-t"}' } }] },
        { id: "old-result", role: "tool", toolCallId: "old-t", subagentRunId: "old-subagent", content: "old-t" },
      ],
      state: { runId: "old-child", nested: { interruptId: "old-interrupt" } },
      tools: [{ name: "lookup", description: "old-t", parameters: { toolCallId: "old-t" } }],
      context: [{ description: "old-m", value: "old-thread" }],
      forwardedProps: { parentRunId: "old-parent", messageId: "old-m" },
      resume: [{ interruptId: "old-interrupt", status: "resolved", payload: { interruptId: "old-interrupt" }, metadata: { toolCallId: "old-t" } }],
    };
    const sourceEvents: AGUIEvent[] = [
      { type: EventType.RUN_STARTED, threadId: "old-thread", runId: "old-child", parentRunId: "old-parent", input: recordedInput },
      { type: EventType.REASONING_ENCRYPTED_VALUE, subtype: "message", entityId: "old-m", encryptedValue: "message-signature" },
      { type: EventType.REASONING_ENCRYPTED_VALUE, subtype: "tool-call", entityId: "old-t", encryptedValue: "tool-signature" },
      { type: EventType.TEXT_MESSAGE_START, messageId: "old-m", role: "assistant" },
      { type: EventType.TOOL_CALL_START, toolCallId: "old-t", toolCallName: "lookup", parentMessageId: "old-m", subagentRunId: "old-subagent" },
      { type: EventType.SUBAGENT_FINISHED, subagentRunId: "old-subagent", outcome: { type: "suspended", interruptIds: ["old-interrupt"] }, result: { interruptId: "old-interrupt" } },
      { type: EventType.RUN_FINISHED, threadId: "old-thread", runId: "old-child", outcome: { type: "interrupt", interrupts: [
        { id: "old-interrupt", reason: "approval", toolCallId: "old-t", subagentRunId: "old-subagent", metadata: { interruptId: "old-interrupt" }, responseSchema: { messageId: "old-m" } },
      ] } },
      { type: EventType.MESSAGES_SNAPSHOT, messages: recordedInput.messages },
    ];
    // Both the fixture and the replay must satisfy the pinned real event schema.
    for (const event of sourceEvents) expect(EventSchemas.safeParse(event).success).toBe(true);
    const recording = parse(sourceEvents.map(event => entry(0, event)));
    const source = structuredClone(recording);
    const currentInput: RunAgentInput = { ...input, ...(parentRunId === undefined ? {} : { parentRunId }) };
    const events: AGUIEvent[] = [];
    for await (const event of runMockRecording(currentInput, recording, { timingScale: 0 })) events.push(event);
    for (const event of events) expect(EventSchemas.safeParse(event).success).toBe(true);
    const started = events[0]!;
    if (started.type !== EventType.RUN_STARTED || !started.input) throw new Error("Missing recorded run input");
    expect(started).toMatchObject({ threadId: input.threadId, runId: input.runId });
    expect(started.parentRunId).toBe(parentRunId);
    expect(started.input.parentRunId).toBe(parentRunId);
    expect(started.parentRunId).not.toBe(started.runId);
    expect(started.input.parentRunId).not.toBe(started.input.runId);
    if (parentRunId === undefined) {
      expect(started).not.toHaveProperty("parentRunId");
      expect(started.input).not.toHaveProperty("parentRunId");
    }
    expect(started.input).toMatchObject({
      threadId: input.threadId, runId: input.runId,
      messages: [
        { id: "current-run:replay:message:1", subagentRunId: "current-run:replay:subagent:1", toolCalls: [{ id: "current-run:replay:tool:1" }] },
        { id: "current-run:replay:message:2", toolCallId: "current-run:replay:tool:1", subagentRunId: "current-run:replay:subagent:1" },
      ],
      resume: [{ interruptId: "current-run:replay:interrupt:1" }],
    });
    expect(events[1]).toMatchObject({ entityId: "current-run:replay:message:1", encryptedValue: "message-signature" });
    expect(events[2]).toMatchObject({ entityId: "current-run:replay:tool:1", encryptedValue: "tool-signature" });
    expect(events[3]).toMatchObject({ messageId: "current-run:replay:message:1" });
    expect(events[4]).toMatchObject({ toolCallId: "current-run:replay:tool:1", parentMessageId: "current-run:replay:message:1" });
    expect(events[5]).toMatchObject({ outcome: { interruptIds: ["current-run:replay:interrupt:1"] }, result: { interruptId: "old-interrupt" } });
    expect(events[6]).toMatchObject({ outcome: { interrupts: [{ id: "current-run:replay:interrupt:1", toolCallId: "current-run:replay:tool:1", subagentRunId: "current-run:replay:subagent:1", metadata: { interruptId: "old-interrupt" }, responseSchema: { messageId: "old-m" } }] } });
    expect(events[7]).toMatchObject({ messages: started.input.messages });
    for (const key of ["state", "tools", "context", "forwardedProps"] as const) expect(started.input[key]).toEqual(recordedInput[key]);
    expect(started.input.messages[0]).toMatchObject({ content: recordedInput.messages[0]!.content, encryptedValue: "message-signature", metadata: { messageId: "old-m" }, toolCalls: [{ function: { arguments: '{"toolCallId":"old-t"}' } }] });
    expect(started.input.resume?.[0]).toMatchObject({ payload: { interruptId: "old-interrupt" }, metadata: { toolCallId: "old-t" } });
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
