import { EMPTY } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import type { AbstractAgent, Middleware, RunAgentInput } from "@ag-ui/client";
import { installCancelledToolContinuationGuard } from "../src/compatibility/cancelled-tool-continuation.js";

function fixture() {
  let middleware!: Middleware;
  const agent = { use: vi.fn((value: Middleware) => { middleware = value; }) } as unknown as AbstractAgent;
  const guard = installCancelledToolContinuationGuard(agent);
  const next = { run: vi.fn(() => EMPTY) } as unknown as AbstractAgent;
  const input = (id = "user-1", tool = false): RunAgentInput => ({ threadId: "A", runId: crypto.randomUUID(), state: {}, context: [], tools: [], forwardedProps: {}, messages: [
    { role: "user", id, content: "Question" }, ...(tool ? [{ role: "tool" as const, id: "result-1", toolCallId: "call-1", content: "cancel receipt" }] : []),
  ] });
  return { agent, guard, next, input, run: (value: RunAgentInput) => middleware.run(value, next) };
}

describe("cancelled tool continuation guard", () => {
  it("drops only the cancelled turn's tool continuation, then permits a fresh user turn", () => {
    const f = fixture(); f.run(f.input()); f.guard.cancel();
    f.run(f.input("user-1", true)); expect(f.next.run).toHaveBeenCalledOnce();
    f.run(f.input("user-2")); expect(f.next.run).toHaveBeenCalledTimes(2);
    f.run(f.input("user-2", true)); expect(f.next.run).toHaveBeenCalledTimes(3);
    expect(installCancelledToolContinuationGuard(f.agent)).toBe(f.guard); expect(f.agent.use).toHaveBeenCalledOnce();
  });
  it("preserves explicit interrupt and command resumes and retry of the same user message", () => {
    const f = fixture(); f.run(f.input()); f.guard.cancel();
    f.run({ ...f.input("user-1", true), forwardedProps: { command: { decisions: [] } } });
    expect(f.next.run).toHaveBeenCalledTimes(2);
    f.guard.cancel();
    const resume = { ...f.input("user-1", true), resume: [{ interruptId: "ask-1", status: "resolved" as const }] };
    f.run(resume); expect(f.next.run).toHaveBeenCalledTimes(3);
    f.guard.cancel(); f.run(f.input()); expect(f.next.run).toHaveBeenCalledTimes(4);
  });
  it("keeps agents isolated and leaves ordinary tool continuation enabled", () => {
    const a = fixture(), b = fixture(); a.run(a.input()); b.run(b.input()); a.guard.cancel();
    b.run(b.input("user-1", true)); expect(b.next.run).toHaveBeenCalledTimes(2);
    a.run(a.input("user-1", true)); expect(a.next.run).toHaveBeenCalledOnce();
  });
});
