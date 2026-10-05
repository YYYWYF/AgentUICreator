import { EventType, type RunAgentInput } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import { backendReferenceMockScenarios, sourceCitationsScenario } from "../src/builtins/index.js";
import { runMockScenario } from "../src/scenario-runner.js";

const input: RunAgentInput = {
  threadId: "sources-thread", runId: "sources-run", state: {}, messages: [], tools: [], context: [], forwardedProps: {},
};

describe("source-citations protocol reference", () => {
  it("declares the Tool-local contract and installable presentation resource", () => {
    expect(backendReferenceMockScenarios).toContain(sourceCitationsScenario);
    expect(sourceCitationsScenario.resources).toEqual(["source-citations-message"]);
    expect(sourceCitationsScenario.reference).toMatchObject({
      protocol: "AG-UI Tool Call",
      pattern: "Application-defined Tool Result → Sources",
      presentation: "assistant-ui Sources",
      notes: expect.arrayContaining([
        "AG-UI does not define a citation/source event.",
        "The sources schema belongs to search_sources Tool Result.",
        "assistant-ui SourceMessagePart is a frontend/runtime presentation contract.",
      ]),
    });
  });
  it("emits ordinary Tool events and JSON string result before the answer", async () => {
    const events = [];
    for await (const event of runMockScenario(input, sourceCitationsScenario, { timingScale: 0 })) events.push(event);
    expect(events.filter(event => event.type.startsWith("TOOL_CALL_")).map(event => event.type)).toEqual([
      EventType.TOOL_CALL_START, EventType.TOOL_CALL_ARGS, EventType.TOOL_CALL_END, EventType.TOOL_CALL_RESULT,
    ]);
    expect(events).toContainEqual(expect.objectContaining({ type: EventType.TOOL_CALL_START, toolCallName: "search_sources" }));
    const result = events.find(event => event.type === EventType.TOOL_CALL_RESULT);
    if (!result || result.type !== EventType.TOOL_CALL_RESULT) throw new Error("Missing Tool result");
    expect(typeof result.content).toBe("string");
    expect(JSON.parse(result.content)).toMatchObject({ sources: [
      { sourceType: "url", id: "react-19" }, { sourceType: "document", id: "migration-guide", mediaType: "application/pdf" },
    ] });
    expect(events.findIndex(event => event.type === EventType.TOOL_CALL_RESULT)).toBeLessThan(events.findIndex(event => event.type === EventType.TEXT_MESSAGE_START));
    expect(events.some(event => event.type === EventType.CUSTOM || event.type.startsWith("SOURCE_"))).toBe(false);
  });
});
