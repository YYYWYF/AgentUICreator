import { EventSchemas, EventType, type BaseEvent, type RunAgentInput } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import { fileOutputScenario } from "../src/builtins/file-output.js";
import { runMockScenario } from "../src/scenario-runner.js";

const input: RunAgentInput = {
  threadId: "file-thread", runId: "file-run", state: {}, messages: [], tools: [], context: [], forwardedProps: {},
};

describe("Backend Tool Result File scenario", () => {
  it("emits the standard tool lifecycle with a string JSON result and no CUSTOM event", async () => {
    const events = [] as BaseEvent[];
    for await (const event of runMockScenario(input, fileOutputScenario, { timingScale: 0 })) {
      events.push(EventSchemas.parse(event));
    }
    const lifecycle = events.filter(event => event.type.startsWith("TOOL_CALL_"));
    expect(lifecycle.map(event => event.type)).toEqual([
      EventType.TOOL_CALL_START, EventType.TOOL_CALL_ARGS, EventType.TOOL_CALL_END, EventType.TOOL_CALL_RESULT,
    ]);
    expect(lifecycle[0]).toMatchObject({ toolCallName: "generate_file" });
    const args = EventSchemas.parse(lifecycle[1]);
    const result = EventSchemas.parse(lifecycle[3]);
    if (args.type !== EventType.TOOL_CALL_ARGS || result.type !== EventType.TOOL_CALL_RESULT) throw new Error("Tool lifecycle missing");
    expect(lifecycle.every(event => "toolCallId" in event && event.toolCallId === result.toolCallId)).toBe(true);
    expect(JSON.parse(args.delta)).toEqual({ filename: "quarterly-report.pdf", format: "pdf" });
    expect(result.role).toBe("tool");
    expect(typeof result.content).toBe("string");
    expect(JSON.parse(result.content)).toEqual({
      filename: "quarterly-report.pdf", mimeType: "application/pdf", url: "https://example.com/generated/quarterly-report.pdf",
    });
    expect(events.some(event => event.type === EventType.CUSTOM)).toBe(false);
    expect(events.map(event => EventSchemas.parse(event)).flatMap(event =>
      event.type === EventType.TEXT_MESSAGE_CONTENT ? [event.delta] : [],
    ).join("")).toBe("报告已经生成。");
  });
});
