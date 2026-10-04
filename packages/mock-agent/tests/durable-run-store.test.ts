import { afterEach, describe, expect, it, vi } from "vitest";
import { MockDurableRunStore } from "../src/durable-run-store.js";

afterEach(() => vi.useRealTimers());

describe("process-owned mock durable run", () => {
  it("continues after the first subscriber disconnects and keeps the invocation count", async () => {
    vi.useFakeTimers();
    const store = new MockDurableRunStore();
    const run = store.start({ threadId: "A", runId: "run-1", messages: [
      { id: "user-1", role: "user", content: "long task" },
    ], state: null, tools: [], context: [] } as never);
    const firstEvents: string[] = [];
    const unsubscribe = store.subscribeEvents("A", event => firstEvents.push(String(event.type)), () => {});
    expect(firstEvents).toContain("TEXT_MESSAGE_CONTENT");
    unsubscribe();
    expect(store.snapshot("A")?.resumable).toBe(true);

    await vi.advanceTimersByTimeAsync(9000);
    expect(store.snapshot("A")).toMatchObject({ runId: "run-1", runCount: 1, resumable: false });
    const continuation: string[] = [];
    store.subscribeContinuation("A", text => continuation.push(text));
    expect(continuation).toEqual(["第二部分完成……任务完成"]);
    expect(run.runCount).toBe(1);
  });
});
