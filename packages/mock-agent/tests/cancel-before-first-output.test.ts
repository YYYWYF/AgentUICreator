import { describe, expect, it, vi } from "vitest";
import { cancelBeforeFirstOutputScenario, runMockScenario } from "../src/index.js";

const input = {
  threadId: "cancel-empty-thread", runId: "cancel-empty-run", state: {},
  messages: [], tools: [], context: [], forwardedProps: {},
};

describe("cancel-before-first-output scenario", () => {
  it("ends an aborted waiting run without assistant or completion events", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const events = runMockScenario(input, cancelBeforeFirstOutputScenario, { signal: controller.signal });
      expect((await events.next()).value).toMatchObject({ type: "RUN_STARTED" });
      const waiting = events.next();
      let settled = false;
      void waiting.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(9_999);
      expect(settled).toBe(false);
      controller.abort();
      expect(await waiting).toEqual({ done: true, value: undefined });
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits a normal text response after the wait when not cancelled", async () => {
    const events = [];
    for await (const event of runMockScenario(input, cancelBeforeFirstOutputScenario, { timingScale: 0 })) events.push(event);
    expect(events[0]?.type).toBe("RUN_STARTED");
    expect(events[1]?.type).toBe("CUSTOM");
    expect(events[2]?.type).toBe("TEXT_MESSAGE_START");
    expect(events.some((event) => event.type === "TEXT_MESSAGE_CONTENT")).toBe(true);
    expect(events.at(-1)?.type).toBe("RUN_FINISHED");
  });
});
