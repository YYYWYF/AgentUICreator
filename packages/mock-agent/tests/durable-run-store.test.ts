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

  it("resumes AgentPlan from the latest Activity snapshot and keeps one run", async () => {
    vi.useFakeTimers();
    const store = new MockDurableRunStore();
    const run = store.start({ threadId: "plan-thread", runId: "plan-run", messages: [
      { id: "plan-user", role: "user", content: "Update the workspace" },
    ], state: null, tools: [], context: [] } as never, "resumable-agent-plan");
    const firstConnection: Record<string, unknown>[] = [];
    const unsubscribeFirst = store.subscribeEvents(
      "plan-thread",
      event => firstConnection.push(event),
      () => undefined,
    );

    expect(firstConnection.map(event => event.type)).toEqual([
      "RUN_STARTED",
      "ACTIVITY_SNAPSHOT",
    ]);
    expect(firstConnection[1]).toMatchObject({
      messageId: "agent-plan-1",
      activityType: "agent-plan",
      content: { activeIndex: 0 },
    });
    await vi.advanceTimersByTimeAsync(700);
    expect(firstConnection.at(-1)).toMatchObject({
      type: "ACTIVITY_DELTA",
      messageId: "agent-plan-1",
      patch: [{ op: "replace", path: "/activeIndex", value: 1 }],
    });
    unsubscribeFirst();

    const resumedEvents: Record<string, unknown>[] = [];
    let completed = false;
    store.subscribeAgentPlanResume(
      "plan-thread",
      event => resumedEvents.push(event),
      () => { completed = true; },
    );
    expect(resumedEvents[0]).toMatchObject({
      type: "ACTIVITY_SNAPSHOT",
      messageId: "agent-plan-1",
      activityType: "agent-plan",
      content: { activeIndex: 1 },
    });
    expect(store.snapshot("plan-thread")).toMatchObject({
      runId: "plan-run",
      runCount: 1,
      resumable: true,
    });

    await vi.advanceTimersByTimeAsync(9000);
    await vi.advanceTimersByTimeAsync(700);
    expect(resumedEvents.map(event => event.type)).toEqual([
      "ACTIVITY_SNAPSHOT",
      "ACTIVITY_DELTA",
      "ACTIVITY_DELTA",
      "RUN_FINISHED",
    ]);
    expect(resumedEvents[1]).toMatchObject({
      patch: [{ op: "replace", path: "/activeIndex", value: 2 }],
    });
    expect(resumedEvents[2]).toMatchObject({
      patch: [{ op: "replace", path: "/activeIndex", value: 3 }],
    });
    expect(completed).toBe(true);
    expect(store.snapshot("plan-thread")).toMatchObject({
      runId: "plan-run",
      runCount: 1,
      resumable: false,
      activity: { activeIndex: 3 },
    });
    expect(run.runCount).toBe(1);
  });
});
