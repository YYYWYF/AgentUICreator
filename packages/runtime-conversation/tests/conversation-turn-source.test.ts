import type { AgentSubscriber } from "@ag-ui/client";
import type { ThreadRuntime } from "@assistant-ui/react";
import { describe, expect, it, vi } from "vitest";
import { LiveConversationTurnSource } from "../src/compatibility/conversation-turn-source.js";

function fixture() {
  let subscriber: AgentSubscriber = {};
  let threadId = "thread-a";
  let messages = [{ id: "u", role: "user", status: { type: "complete" } }];
  let listener = () => {};
  const unsubscribe = vi.fn();
  const agent = { subscribe(next: AgentSubscriber) { subscriber = next; return { unsubscribe }; } };
  const thread = { getState: () => ({ messages }), subscribe(next: () => void) { listener = next; return unsubscribe; } } as unknown as ThreadRuntime;
  const source = new LiveConversationTurnSource(agent, thread, () => threadId);
  source.start();
  return {
    source, unsubscribe,
    start(runId: string) { subscriber.onRunStartedEvent?.({ event: { threadId, runId } } as never); },
    finish() { subscriber.onRunFinishedEvent?.({} as never); },
    append(id: string, role = "assistant", status = "running") { messages = [...messages, { id, role, status: { type: status } }]; listener(); },
    switchThread(id: string) { threadId = id; messages = []; source.sync(); },
  };
}

describe("live root-run attribution adapter", () => {
  it("attributes all new assistant messages to one run without mutating messages", () => {
    const f = fixture();
    f.start("run-1"); f.append("a"); f.append("b");
    expect(f.source.getSnapshot()).toEqual({ a: "run-1", b: "run-1" });
    f.finish(); f.append("history", "assistant", "complete");
    expect(f.source.getSnapshot()).toEqual({ a: "run-1", b: "run-1" });
    f.source.stop(); expect(f.unsubscribe).toHaveBeenCalledTimes(2);
  });
  it("captures an upstream running placeholder created before RUN_STARTED", () => {
    const f = fixture(); f.append("placeholder"); f.start("run-1");
    expect(f.source.getSnapshot()).toEqual({ placeholder: "run-1" });
    f.source.stop();
  });
  it("isolates thread switches and keeps checkpoint history free of run requirements", () => {
    const f = fixture(); f.start("run-1"); f.append("a");
    f.switchThread("thread-b"); f.append("checkpoint", "assistant", "complete");
    expect(f.source.getSnapshot()).toEqual({});
    f.switchThread("thread-a");
    expect(f.source.getSnapshot()).toEqual({ a: "run-1" });
    f.source.stop();
  });
});
