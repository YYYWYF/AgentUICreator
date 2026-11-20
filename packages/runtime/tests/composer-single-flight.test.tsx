import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { ConversationRuntimeProvider } from "../src/ConversationRuntimeProvider.js";
import { useConversationRuntimeBridge } from "../src/ConversationRuntimeBridgeContext.js";
import { HttpAgent } from "@ag-ui/client";
import type { ConversationThreadBinding } from "../src/threads/types.js";
import type { AgentRuntime } from "@za38.03/agent-ui-core";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type RunInput = { threadId: string; runId: string; messages: { role: string; content?: string }[] };
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  throw new Error("Timed out waiting for runtime");
}
async function fixture() {
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
    renderer = create(<ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding}
      unstable_agentFactory={({ endpoint, threadId }) => new HttpAgent({ url: endpoint, threadId, fetch: async (_url, init) => {
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
describe("Composer single-flight sends", () => {
  it("keeps a new draft unsent while the current run is active and after it finishes", async () => {
    const f = await fixture();
    try {
      expect(f.runtime.thread.getState().capabilities.queue).toBe(false);
      await f.send("A"); await until(() => f.runs.length === 1);
      await act(async () => f.runtime.thread.composer.setText("B"));
      expect(f.runs).toHaveLength(1); expect(f.queue).toEqual([]);
      expect(f.runtime.thread.composer.getState().text).toBe("B");
      await act(async () => f.runs[0]!.finish());
      await until(() => !f.runtime.thread.getState().isRunning);
      expect(f.runs).toHaveLength(1); expect(f.queue).toEqual([]);
      expect(f.runtime.thread.composer.getState().text).toBe("B");
      await act(async () => f.runtime.thread.composer.send());
      await until(() => f.runs.length === 2);
      expect(f.runs[1]!.input.messages).toMatchObject([{ role: "user", content: "B" }]);
    } finally { await f.dispose(); }
  });
  it("rejects programmatic sends while the current run is active", async () => {
    const f = await fixture();
    try {
      await f.send("A"); await until(() => f.runs.length === 1);
      await expect(f.bridge.sendMessage("programmatic")).rejects.toMatchObject({ name: "AgentUiRuntimeBusyError" });
      expect(f.queue).toEqual([]); expect(f.runs).toHaveLength(1);
    } finally { await f.dispose(); }
  });
  it("preserves the next draft on cancellation and requires an explicit send", async () => {
    const f = await fixture();
    try {
      await f.send("A"); await until(() => f.runs.length === 1);
      await act(async () => f.runtime.thread.composer.setText("B"));
      await act(async () => f.runtime.thread.cancelRun());
      await until(() => !f.runtime.thread.getState().isRunning);
      expect(f.runs).toHaveLength(1); expect(f.queue).toEqual([]);
      expect(f.runtime.thread.composer.getState().text).toBe("B");
      await act(async () => f.runtime.thread.composer.send());
      await until(() => f.runs.length === 2);
      expect(f.runs[1]!.input.messages).toMatchObject([{ role: "user", content: "B" }]);
    } finally { await f.dispose(); }
  });
});
