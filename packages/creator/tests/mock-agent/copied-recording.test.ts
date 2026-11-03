import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseMockRecording } from "../../src/mock-agent/recording.js";
import { runMockRecording } from "../../src/mock-agent/recording-runner.js";

const events = [
  { type: "RUN_STARTED", threadId: "old", runId: "old" },
  { type: "TEXT_MESSAGE_START", messageId: "m", role: "assistant" },
  { type: "TEXT_MESSAGE_CONTENT", messageId: "m", delta: '  你好\t世界\n  data: { "a": "\\" }  \u00a0\u200b' },
  { type: "TEXT_MESSAGE_END", messageId: "m" },
  { type: "RUN_FINISHED", threadId: "old", runId: "old" },
];
const parse = (text: string) => parseMockRecording(text, { id: "clipboard" });
const times = ["15:04:03.050", "15:04:03.075", "15:04:03.250", "15:04:03.250", "15:04:04.050"];
afterEach(() => vi.useRealTimers());

describe("browser-copied local recordings", () => {
  it.each(["response.sse", "eventstream.txt"])("reads the actual Chrome DevTools clipboard capture %s", file => {
    const copied = readFileSync(new URL(`./fixtures/browser-copy/${file}`, import.meta.url), "utf8");
    const recording = parse(copied);
    expect(recording.events.map(entry => entry.event.type)).toEqual(events.map(event => event.type));
    expect(recording.events.map(entry => entry.atMs)).toEqual(file.endsWith(".sse") ? [0, 100, 200, 300, 400] : [0, 223, 361, 476, 607]);
    // Chromium's table selection collapses spaces in its rendered cell; the
    // Response editor preserves the raw payload. Preserve exactly what was copied.
    expect(recording.events[2]?.event).toMatchObject({ delta: file.endsWith(".sse") ? "  copied 中文\ttext\n  preserved  " : " copied 中文\ttext\n preserved " });
  });
  it.each(["\n", "\r\n", "\r"])("reads Response SSE with %j lines, indentation, metadata and heartbeats", newline => {
    const text = ["\uFEFF  ", "  : keepalive", "  retry: 5000", ...events.flatMap((event, i) => [
      `  id: ${i + 1}`, "\tevent: message", ` \tdata:    ${JSON.stringify(event)}   `, "  ", "",
    ]), " data: [DONE]", ""].join(newline);
    expect(parse(text).events).toEqual(events.map((event, index) => ({ atMs: index * 100, event })));
  });

  it("reads multiline data fields, copied pretty JSON and consecutive frames without blank separators", () => {
    const multiline = events.map(event => JSON.stringify(event, null, 2).split("\n").map(line => `  data: ${line}`).join("\n")).join("\n\n");
    expect(parse(multiline).events.map(entry => entry.event)).toEqual(events);
    const pretty = events.map(event => `data: ${JSON.stringify(event, null, 2)}`).join("\n\n");
    expect(parse(pretty).events.map(entry => entry.event)).toEqual(events);
    expect(parse(events.map(event => `data:${JSON.stringify(event)}`).join("\n")).events).toHaveLength(5);
  });

  it.each(["\t", "    ", "\n", "\n\n  "])("reads EventStream grid selection separated by %j", separator => {
    const rows = ["ID", "Type", "Data", "Time"].join(separator) + "\n" + events.map((event, index) =>
      [index ? String(index) : "", "message", JSON.stringify(event), times[index]].join(separator),
    ).join("\r\n\r\n");
    const recording = parse(`\uFEFF\n  ${rows} \t\n`);
    expect(recording.events.map(entry => entry.atMs)).toEqual([0, 25, 200, 200, 1000]);
    expect(recording.events.map(entry => entry.event)).toEqual(events);
  });

  it("accepts localized headers, empty IDs, reordered columns and multiline Data", () => {
    const text = ["时间\t数据\t类型\tID", ...events.map((event, index) =>
      `${times[index]}\t${JSON.stringify(event, null, 2)}\tmessage\t`,
    )].join("\n");
    expect(parse(text).events.map(entry => entry.atMs)).toEqual([0, 25, 200, 200, 1000]);
    expect(parse(text).events.map(entry => entry.event)).toEqual(events);
  });

  it("uses default time for Copy message JSON and preserves all whitespace inside payloads", () => {
    // NBSP / zero-width separators outside strings are clipboard formatting.
    const copied = events.map(event => JSON.stringify(event, null, 2).replace(/\n  /g, "\n\u00a0\u200b  ")).join("\n\n\t");
    expect(parse(copied).events).toEqual(events.map((event, index) => ({ atMs: index * 100, event })));
    const extended = { ...events[2], atMs: 17, event: { opaque: true } };
    expect(parse(JSON.stringify(extended)).events[0]).toEqual({ atMs: 0, event: extended });
  });

  it("normalizes midnight and rejects backwards, missing, duplicate and invalid times", () => {
    const row = (time: string) => `message\t${JSON.stringify(events[0])}\t${time}`;
    expect(parse([row("23:59:59.950"), row("00:00:00.050")].join("\n")).events.map(entry => entry.atMs)).toEqual([0, 100]);
    expect(() => parse([row("15:00:01.000"), row("15:00:00.900")].join("\n"))).toThrow("decreasing");
    expect(() => parse([row("15:00:01.000"), row("")].join("\n"))).toThrow("missing");
    expect(() => parse(row("15:00:01.000 15:00:02.000"))).toThrow("one EventStream time");
    expect(() => parse(row("25:00:00.000"))).toThrow("invalid EventStream time");
  });

  it("reports invalid/truncated copied events rather than silently skipping them", () => {
    for (const text of [
      'data: {"type":"FAKE"}',
      'data: {"type":"TEXT_MESSAGE_CONTENT"}',
      'data: {"type":"RUN_STARTED",',
      `data: ${JSON.stringify(events[0])}\n\ndata: oops`,
      `data: ${JSON.stringify(events[0])}\n\ndata: [DONE]\n\ndata: ${JSON.stringify(events[1])}`,
      `message\t${JSON.stringify(events[0])}\t15:00:00.000\nmessage\t{"type":`,
      `oops\n${JSON.stringify(events[0])}`,
    ]) expect(() => parse(text)).toThrow(/Line \d+/);
  });

  it.each(["response", "eventstream"])("replays %s timing with the existing speed and cancellation controls", async format => {
    vi.useFakeTimers();
    const recording = parse(events.map((event, index) => format === "response"
      ? `data: ${JSON.stringify(event)}\n` : `message\t${JSON.stringify(event)}\t${times[index]}`).join("\n"));
    const input = { threadId: "current", runId: "current", messages: [], tools: [], context: [], state: {}, forwardedProps: {} };
    const controller = new AbortController();
    const stream = runMockRecording(input, recording, { timingScale: 2, signal: controller.signal });
    expect((await stream.next()).value).toMatchObject({ threadId: "current", runId: "current" });
    let done = false;
    const second = stream.next().then(value => { done = true; return value; });
    const delay = format === "response" ? 200 : 50;
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await second).value?.type).toBe("TEXT_MESSAGE_START");
    const third = stream.next();
    controller.abort();
    expect((await third).done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
