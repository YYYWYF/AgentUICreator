import { HttpAgent } from "@ag-ui/client";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAgUiRuntime, type AgUiAssistantRuntime } from "@assistant-ui/react-ag-ui";
import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";

async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error("AG-UI outcome did not settle");
}

async function fixture(events: (input: Record<string, any>, request: number) => object[]) {
  const requests: Record<string, any>[] = [];
  const agent = new HttpAgent({ url: "https://example.test/agent", fetch: async (_url, init) => {
    const input = JSON.parse(String(init.body)); requests.push(input);
    const frames = [{ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId }, ...events(input, requests.length)];
    return new Response(frames.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  } });
  let runtime!: AgUiAssistantRuntime;
  function Capture() {
    const current = useAgUiRuntime({ agent });
    useEffect(() => { runtime = current; }, [current]);
    return <AssistantRuntimeProvider runtime={current}>{null}</AssistantRuntimeProvider>;
  }
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<Capture />); });
  await until(() => runtime !== undefined && !runtime.thread.getState().isLoading);
  await act(async () => { runtime.thread.append("Test terminal outcome"); });
  await until(() => requests.length > 0 && !runtime.thread.getState().isRunning);
  return { runtime, requests, close: async () => { await act(async () => tree.unmount()); } };
}
const finish = (input: Record<string, any>, outcome: object) => ({ type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId, outcome });

describe("AG-UI 1.0 terminal outcomes", () => {
  it("projects a server cancelled outcome without reporting an inference error", async () => {
    const f = await fixture(input => [
      { type: "TEXT_MESSAGE_START", messageId: "a1", role: "assistant" },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "a1", delta: "Partial answer" },
      { type: "TEXT_MESSAGE_END", messageId: "a1" },
      finish(input, { type: "cancelled" }),
    ]);
    try {
      expect(f.runtime.thread.getState().messages.at(-1)?.status).toEqual({ type: "incomplete", reason: "cancelled" });
      expect(f.requests).toHaveLength(1);
    } finally { await f.close(); }
  });

  it.each(["resolved", "unresolved"])("uses pendingToolCallIds to select the %s tool", async pending => {
    const f = await fixture(input => [
      { type: "TEXT_MESSAGE_START", messageId: "a1", role: "assistant" },
      { type: "TEXT_MESSAGE_END", messageId: "a1" },
      ...["resolved", "unresolved"].flatMap(id => [
        { type: "TOOL_CALL_START", toolCallId: id, toolCallName: "answer", parentMessageId: "a1" },
        { type: "TOOL_CALL_ARGS", toolCallId: id, delta: "{}" },
        { type: "TOOL_CALL_END", toolCallId: id },
      ]),
      { type: "TOOL_CALL_RESULT", messageId: "t1", toolCallId: "resolved", content: [{ type: "text", text: "receipt" }], role: "tool" },
      finish(input, { type: "success", pendingToolCallIds: [pending] }),
    ]);
    try {
      expect(f.runtime.thread.getState().messages.at(-1)?.status?.type).toBe(pending === "resolved" ? "complete" : "requires-action");
      const part = f.runtime.thread.getState().messages.flatMap(message => message.role === "assistant" ? message.content : []).find(part => part.type === "tool-call" && part.toolCallId === "resolved");
      expect(part).toMatchObject({ type: "tool-call", result: [{ type: "text", text: "receipt" }] });
    } finally { await f.close(); }
  });

  it("can cancel an expired interrupt and resume on the same thread", async () => {
    const f = await fixture((input, request) => request === 1 ? [
      finish(input, { type: "interrupt", interrupts: [{ id: "expired", reason: "confirmation", expiresAt: "2020-01-01T00:00:00Z" }] }),
    ] : [finish(input, { type: "success" })]);
    try {
      expect(f.runtime.unstable_getPendingInterrupts()).toHaveLength(1);
      await act(async () => { await f.runtime.unstable_submitInterruptResponses([{ interruptId: "expired", status: "cancelled" }]); });
      await until(() => f.requests.length === 2 && !f.runtime.thread.getState().isRunning);
      expect(f.requests[1]!.threadId).toBe(f.requests[0]!.threadId);
      expect(f.requests[1]!.resume).toEqual([{ interruptId: "expired", status: "cancelled" }]);
      expect(f.runtime.unstable_getPendingInterrupts()).toEqual([]);
    } finally { await f.close(); }
  });
});
