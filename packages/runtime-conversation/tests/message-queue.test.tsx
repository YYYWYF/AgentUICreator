import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { ConversationRuntimeProvider } from "../src/ConversationRuntimeProvider.js";
import { useConversationRuntimeBridge } from "../src/ConversationRuntimeBridgeContext.js";
import { CancellationAwareHttpAgent } from "../src/compatibility/cancellation-aware-http-agent.js";
import type { ConversationThreadBinding } from "../src/threads/types.js";
import type { AgentFrontendToolSource, AgentRuntime } from "@agent-ui/runtime-core";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type RunInput = { threadId: string; runId: string; messages: { role: string; content?: string }[] };
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  throw new Error("Timed out waiting for queue runtime");
}
async function fixture(enableMessageQueue?: boolean, frontendTools?: AgentFrontendToolSource) {
  let runtime!: AssistantRuntime; let bridge!: AgentRuntime;
  const runs: { input: RunInput; finish(outcome?: Record<string, unknown>): void; emit(event: Record<string, unknown>): void }[] = [];
  let active = "A"; const mounted = new Set<string>();
  const binding: ConversationThreadBinding = {
    getThreadId: () => active, activateThread: id => { active = id; }, subscribe: () => () => {}, createNewThread: async () => "new",
    loadThread: async () => ({ messages: [] }),
    getThreadListSnapshot: () => ({ threads: [{ id: "A", status: "regular" }, { id: "B", status: "regular" }], archivedThreads: [] }),
  };
  function Capture() { runtime = useAui().threads.__internal_getAssistantRuntime!(); mounted.add(runtime.threads.getState().mainThreadId); bridge = useConversationRuntimeBridge().agentRuntime; return null; }
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding} enableMessageQueue={enableMessageQueue} frontendTools={frontendTools}
      unstable_agentFactory={({ endpoint, threadId }) => new CancellationAwareHttpAgent({ url: endpoint, threadId, fetch: async (_url, init) => {
        const input = JSON.parse(String(init.body)) as RunInput;
        const encoder = new TextEncoder(); let controller!: ReadableStreamDefaultController<Uint8Array>;
        const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
        const emit = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        const id = `answer-${runs.length}`;
        runs.push({ input, emit, finish(outcome) {
          emit({ type: "TEXT_MESSAGE_END", messageId: id });
          emit({ type: "RUN_FINISHED", threadId, runId: input.runId, ...(outcome ? { outcome } : {}) }); controller.close();
        } });
        emit({ type: "RUN_STARTED", threadId, runId: input.runId });
        emit({ type: "TEXT_MESSAGE_START", role: "assistant", messageId: id });
        emit({ type: "TEXT_MESSAGE_CONTENT", messageId: id, delta: "response" });
        init.signal?.addEventListener("abort", () => controller.error(new Error("BodyStreamBuffer was aborted")), { once: true });
        return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
      } })}><Capture /></ConversationRuntimeProvider>);
    });
  await until(() => !runtime.thread.getState().isLoading);
  const send = async (text: string) => { await act(async () => { runtime.thread.composer.setText(text); runtime.thread.composer.send(); }); };
  return { get runtime() { return runtime; }, get bridge() { return bridge; }, runs, send,
    get queue() { return runtime.thread.composer.getState().queue; },
    dispose: async () => { await act(async () => { for (const item of mounted) runtime.threads.getById(item).cancelRun(); renderer.unmount(); }); },
  };
}
describe("native AG-UI follow-up Queue", () => {
  it("leaves direct Provider queue disabled by default", async () => {
    const f = await fixture(); try { expect(f.runtime.thread.getState().capabilities.queue).toBe(false); } finally { await f.dispose(); }
  });
  it("buffers B/C, removes B, then dispatches C as an ordinary run", async () => {
    const f = await fixture(true);
    try {
      expect(f.runtime.thread.getState().capabilities.queue).toBe(true);
      await f.send("A"); await until(() => f.runs.length === 1);
      await f.send("B"); await f.send("C");
      expect(f.runs).toHaveLength(1); expect(f.queue.map(x => x.prompt)).toEqual(["B", "C"]);
      await act(async () => f.runtime.thread.composer.removeQueueItem(f.queue[0]!.id));
      await act(async () => f.runs[0]!.finish());
      await until(() => f.runs.length === 2);
      expect(f.runs[1]!.input.messages.filter(x => x.role === "user").map(x => x.content)).toEqual(["A", "C"]);
      expect(f.runs[1]!.input).toMatchObject({ threadId: "A", runId: expect.any(String) });
      expect(f.queue).toEqual([]);
    } finally { await f.dispose(); }
  });
  it("keeps programmatic send single-flight even with Composer queue enabled", async () => {
    const f = await fixture(true);
    try {
      await f.send("A"); await until(() => f.runs.length === 1);
      await expect(f.bridge.sendMessage("programmatic")).rejects.toMatchObject({ name: "AgentUiRuntimeBusyError" });
      expect(f.queue).toHaveLength(0); expect(f.runs).toHaveLength(1);
    } finally { await f.dispose(); }
  });
  it("preserves pending messages and pauses after cancelling the active run", async () => {
    const f = await fixture(true);
    try {
      await f.send("A"); await until(() => f.runs.length === 1); await f.send("B");
      await act(async () => f.runtime.thread.cancelRun());
      await until(() => !f.runtime.thread.getState().isRunning);
      expect(f.queue.map(x => x.prompt)).toEqual(["B"]); expect(f.runs).toHaveLength(1);
    } finally { await f.dispose(); }
  });
  it("isolates pending messages when switching threads", async () => {
    const f = await fixture(true);
    try {
      await f.send("A"); await until(() => f.runs.length === 1); await f.send("pending A");
      await act(async () => f.runtime.threads.switchToThread("B"));
      await until(() => !f.runtime.thread.getState().isLoading);
      expect(f.queue).toHaveLength(0);
      await f.send("B"); await until(() => f.runs.length === 2);
      expect(f.runs[1]!.input.threadId).toBe("B");
      await act(async () => f.runtime.threads.switchToThread("A"));
      expect(f.queue.map(x => x.prompt)).toEqual(["pending A"]);
    } finally { await f.dispose(); }
  });
  it("holds follow-ups when the active run settles on an interrupt", async () => {
    const f = await fixture(true);
    try {
      await f.send("A"); await until(() => f.runs.length === 1); await f.send("B");
      await act(async () => f.runs[0]!.finish({ type: "interrupt", interrupts: [{ id: "approval", reason: "confirmation", value: { question: "Continue?" } }] }));
      await until(() => !f.runtime.thread.getState().isRunning);
      expect(f.queue.map(x => x.prompt)).toEqual(["B"]); expect(f.runs).toHaveLength(1);
      expect(f.runtime.thread.getState().messages.at(-1)?.status?.type).toBe("requires-action");
      const resumed = f.bridge.resumeInterrupts([{ interruptId: "approval", status: "resolved" }]);
      await until(() => f.runs.length === 2);
      expect(f.queue).toHaveLength(1);
      await act(async () => f.runs[1]!.finish());
      await act(async () => { await resumed; });
      await until(() => f.runs.length === 3);
      expect(f.runs[2]!.input.messages.at(-1)?.content).toBe("B");
    } finally { await f.dispose(); }
  });
  it("holds follow-ups while a client tool executes, then drains after its continuation", async () => {
    let resolveTool!: (value: { content: string }) => void;
    let executing = false;
    const tools: AgentFrontendToolSource = {
      listTools: () => [{ name: "confirm", description: "Confirm", inputSchema: { type: "object", properties: {} } }],
      subscribe: () => () => {}, getRevision: () => 0,
      execute: () => { executing = true; return new Promise(resolve => { resolveTool = resolve; }); },
    };
    const f = await fixture(true, tools);
    try {
      await f.send("A"); await until(() => f.runs.length === 1);
      await act(async () => {
        f.runs[0]!.emit({ type: "TOOL_CALL_START", toolCallId: "confirm-1", toolCallName: "confirm", parentMessageId: "answer-0" });
        f.runs[0]!.emit({ type: "TOOL_CALL_ARGS", toolCallId: "confirm-1", delta: "{}" });
        f.runs[0]!.emit({ type: "TOOL_CALL_END", toolCallId: "confirm-1" });
      });
      await act(async () => { await new Promise(r => setTimeout(r, 10)); });
      await act(async () => f.runs[0]!.finish());
      await until(() => executing);
      await f.send("B");
      expect(f.runs).toHaveLength(1); expect(f.queue).toHaveLength(1);
      await act(async () => resolveTool({ content: "confirmed" }));
      await until(() => f.runs.length === 2);
      expect(f.queue).toHaveLength(1);
      await act(async () => f.runs[1]!.finish());
      await until(() => f.runs.length === 3);
      expect(f.runs[2]!.input.messages.at(-1)?.content).toBe("B");
    } finally { await f.dispose(); }
  });
  // Known pinned-upstream race. A future upstream fix should turn this into a normal passing test.
  it.fails("holds already queued follow-ups across the client-tool handoff (pinned upstream limitation)", async () => {
    const tools: AgentFrontendToolSource = {
      listTools: () => [{ name: "confirm", description: "Confirm", inputSchema: { type: "object", properties: {} } }],
      subscribe: () => () => {}, getRevision: () => 0,
      execute: () => new Promise(() => {}),
    };
    const f = await fixture(true, tools);
    try {
      await f.send("A"); await until(() => f.runs.length === 1); await f.send("B");
      await act(async () => {
        f.runs[0]!.emit({ type: "TOOL_CALL_START", toolCallId: "confirm-1", toolCallName: "confirm", parentMessageId: "answer-0" });
        f.runs[0]!.emit({ type: "TOOL_CALL_ARGS", toolCallId: "confirm-1", delta: "{}" });
        f.runs[0]!.emit({ type: "TOOL_CALL_END", toolCallId: "confirm-1" });
      });
      await act(async () => { await new Promise(r => setTimeout(r, 10)); });
      await act(async () => f.runs[0]!.finish());
      await act(async () => { await new Promise(r => setTimeout(r, 30)); });
      expect(f.runs).toHaveLength(1);
      expect(f.queue.map(x => x.prompt)).toEqual(["B"]);
    } finally { await f.dispose(); }
  });
  it.each(["edit", "reload"] as const)("clears pending queue on native %s", async action => {
    const f = await fixture(true);
    try {
      await f.send("A"); await until(() => f.runs.length === 1); await f.send("B");
      await act(async () => f.runtime.thread.cancelRun());
      await until(() => !f.runtime.thread.getState().isRunning);
      expect(f.queue).toHaveLength(1);
      await act(async () => {
        if (action === "reload") f.runtime.thread.getMessageById("answer-0").reload();
        else {
          const user = f.runtime.thread.getState().messages.find(x => x.role === "user")!;
          const composer = f.runtime.thread.getMessageById(user.id).composer;
          composer.beginEdit(); composer.setText("edited"); composer.send();
        }
      });
      await until(() => f.runs.length === 2);
      expect(f.queue).toHaveLength(0);
      expect(f.runs[1]!.input.messages.some(x => x.content === "B")).toBe(false);
    } finally { await f.dispose(); }
  });
  it("keeps attachment parts and stable directive IDs through queued dispatch", async () => {
    const f = await fixture(true);
    const text = ":user[张三]{name=employee_84721}";
    try {
      await f.send("A"); await until(() => f.runs.length === 1);
      await act(async () => f.runtime.thread.append({ role: "user", content: [{ type: "text", text }],
        attachments: [{ id: "file", type: "document", name: "report.pdf", contentType: "application/pdf", status: { type: "complete" }, content: [{ type: "file", data: "cGRm", mimeType: "application/pdf", filename: "report.pdf" }] }],
      }));
      expect(f.queue[0]?.parts).toEqual(expect.arrayContaining([expect.objectContaining({ type: "text", text }), expect.objectContaining({ type: "file", filename: "report.pdf" })]));
      await act(async () => f.runs[0]!.finish()); await until(() => f.runs.length === 2);
      expect(f.runs[1]!.input.messages.at(-1)?.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: "text", text }), expect.objectContaining({ type: "document" })]));
    } finally { await f.dispose(); }
  });
});
