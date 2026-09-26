import { describe, expect, it } from "vitest";
import { multiMessageResponseScenario, runMockScenario } from "../src/index.js";

describe("multi-message-response AG-UI scenario", () => {
  it("emits three distinct standard messages inside one run", async () => {
    const events = [];
    for await (const event of runMockScenario({
      threadId: "response-thread", runId: "response-run", state: {},
      messages: [], tools: [], context: [], forwardedProps: {},
    }, multiMessageResponseScenario, { timingScale: 0 })) events.push(event);
    const starts = events.filter((event) => event.type === "TEXT_MESSAGE_START");
    expect(starts).toHaveLength(3);
    expect(new Set(starts.map((event) => event.messageId)).size).toBe(3);
    expect(events.filter((event) => event.type === "TEXT_MESSAGE_END")).toHaveLength(3);
    expect(events.filter((event) => event.type === "RUN_STARTED")).toHaveLength(1);
    expect(events.filter((event) => event.type === "RUN_FINISHED")).toHaveLength(1);
    expect(events.filter((event) => event.type === "CUSTOM")).toHaveLength(0);
  });
});
