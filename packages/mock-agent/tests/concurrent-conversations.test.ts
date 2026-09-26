import type { RunAgentInput } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import { concurrentConversationsScenario } from "../src/builtins/concurrent-conversations.js";
import { runMockScenario } from "../src/scenario-runner.js";

function input(threadId: string, text: string): RunAgentInput {
  return { threadId, runId: `run-${threadId}`, state: {}, tools: [], context: [], forwardedProps: {}, messages: [{ id: `user-${threadId}`, role: "user", content: text }] };
}

describe("Concurrent Conversations demo", () => {
  it("interleaves two independent iterators with explicit thread/run ownership", async () => {
    const a = runMockScenario(input("A", "AAA"), concurrentConversationsScenario, { timingScale: 0 });
    const b = runMockScenario(input("B", "BBB"), concurrentConversationsScenario, { timingScale: 0 });
    const events: Array<{ owner: string; event: Record<string, unknown> }> = [];
    for (;;) {
      const [nextA, nextB] = await Promise.all([a.next(), b.next()]);
      if (!nextA.done) events.push({ owner: "A", event: nextA.value as unknown as Record<string, unknown> });
      if (!nextB.done) events.push({ owner: "B", event: nextB.value as unknown as Record<string, unknown> });
      if (nextA.done && nextB.done) break;
    }
    for (const owner of ["A", "B"]) {
      const ownEvents = events.filter(item => item.owner === owner).map(item => item.event);
      expect(ownEvents[0]).toMatchObject({ type: "RUN_STARTED", threadId: owner, runId: `run-${owner}` });
      expect(ownEvents.at(-1)).toMatchObject({ type: "RUN_FINISHED", threadId: owner, runId: `run-${owner}` });
      expect(ownEvents.filter(event => event.type === "TEXT_MESSAGE_CONTENT").map(event => event.delta).join("")).toBe(`${owner}-1\n${owner}-2\n${owner}-3\n`);
      expect(ownEvents.find(event => event.type === "CUSTOM")).toMatchObject({ value: { threadId: owner, runId: `run-${owner}`, label: owner } });
    }
    expect(events.filter(item => item.event.type === "TEXT_MESSAGE_CONTENT").slice(0, 4).map(item => item.owner)).toEqual(["A", "B", "A", "B"]);
  });
});
