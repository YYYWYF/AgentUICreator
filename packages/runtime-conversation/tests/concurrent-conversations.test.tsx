import { useConversationNavigation, type ConversationNavigation } from "@agent-ui/react";
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { AgentRuntime } from "@agent-ui/runtime-core";
import { ConversationRuntimeProvider } from "../src/ConversationRuntimeProvider.js";
import { useConversationRuntimeBridge } from "../src/ConversationRuntimeBridgeContext.js";
import { CancellationAwareHttpAgent } from "../src/compatibility/cancellation-aware-http-agent.js";
import type {
  ConversationLoadedThread,
  ConversationThreadBinding,
  ConversationThreadListSnapshot,
} from "../src/threads/types.js";

async function tick() { await new Promise<void>(resolve => setImmediate(resolve)); }
async function until(predicate: () => boolean) {
  for (let n = 0; n < 100; n++) { if (predicate()) return; await tick(); }
  throw new Error("Timed out waiting for thread runtime");
}

/** Contract fixture only; application persistence policy is tested by the example. */
function createPersistenceFixture() {
  let activeId = "A";
  const persistedIds = new Set<string>(["A"]);
  const ephemeralIds = new Set<string>();
  const listeners = new Set<() => void>();
  const persistedHistory = (id: string): ConversationLoadedThread => ({
    messages: [
      { id: `${id}-user`, role: "user", content: [{ type: "text", text: `request ${id}` }],
        attachments: [], createdAt: new Date(0), metadata: { custom: {} } },
      { id: `${id}-answer`, role: "assistant", content: [{ type: "text", text: `complete ${id}` }],
        status: { type: "complete", reason: "stop" }, createdAt: new Date(0),
        metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} } },
    ],
    state: { owner: id },
  });
  const histories = new Map<string, ConversationLoadedThread>([["A", persistedHistory("A")]]);
  const readHistory = vi.fn(async (id: string) => {
    const loaded = histories.get(id);
    if (loaded === undefined) throw new Error(`Missing persisted conversation ${id}`);
    return loaded;
  });
  const loadThread = vi.fn(async (id: string): Promise<ConversationLoadedThread> =>
    ephemeralIds.has(id) ? { messages: [] } : readHistory(id));
  const activateThread = vi.fn((id: string) => { activeId = id; });
  const reserveThread = (id: string) => { ephemeralIds.add(id); };
  let snapshot: ConversationThreadListSnapshot = {
    threads: [{ id: "A", status: "regular" }], archivedThreads: [],
  };
  const binding: ConversationThreadBinding = {
    getThreadId: () => activeId,
    loadThread,
    activateThread,
    reserveThread,
    initializeThread: async id => { reserveThread(id); return id; },
    deleteThread: async id => {
      persistedIds.delete(id);
      ephemeralIds.delete(id);
      histories.delete(id);
      snapshot = { threads: [...persistedIds].map(id => ({ id, status: "regular" })), archivedThreads: [] };
      listeners.forEach(listener => listener());
    },
    getThreadListSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    createNewThread: async () => {
      const id = crypto.randomUUID();
      reserveThread(id);
      activateThread(id);
      return id;
    },
  };
  return { binding, persistedIds, ephemeralIds, loadThread, readHistory, activateThread,
    persistThread(id: string) {
      // Simulate persistence confirmation through the binding's list snapshot.
      histories.set(id, persistedHistory(id));
      persistedIds.add(id);
      ephemeralIds.delete(id);
      snapshot = { threads: [...persistedIds].map(id => ({ id, status: "regular" })), archivedThreads: [] };
      listeners.forEach(listener => listener());
    },
  };
}

type Stream = { emit(event: Record<string, unknown>): void; finish(outcome?: Record<string, unknown>): void; fail(): void; input: { threadId: string; runId: string; resume?: unknown[] } };
async function fixture(failFirstBHistory = false, providedBinding?: ConversationThreadBinding) {
  const agents = new Map<string, CancellationAwareHttpAgent>();
  const streams = new Map<string, Stream>();
  const bridges = new Map<string, AgentRuntime>();
  let currentId = "A";
  let failedB = false;
  const load = vi.fn(async (id: string) => {
    if (failFirstBHistory && id === "B" && !failedB) { failedB = true; throw new Error("history offline"); }
    return ({
    messages: [{ id: `${id}-history`, role: "user" as const, content: [{ type: "text", text: `history ${id}` }], attachments: [], createdAt: new Date(0), metadata: { custom: {} } }],
    state: { owner: id },
  }); });
  const binding: ConversationThreadBinding = providedBinding ?? {
    getThreadId: () => currentId,
    activateThread: id => { currentId = id; },
    subscribe: () => () => {},
    createNewThread: async () => crypto.randomUUID(),
    loadThread: load,
    getThreadListSnapshot: () => ({ threads: [{ id: "A", status: "regular" }, { id: "B", status: "regular" }], archivedThreads: [] }),
  };
  let runtime!: AssistantRuntime;
  let navigation!: ConversationNavigation;
  let currentBridge!: AgentRuntime;
  function Capture() {
    const aui = useAui();
    runtime = aui.threads.__internal_getAssistantRuntime!();
    navigation = useConversationNavigation();
    const { agentRuntime } = useConversationRuntimeBridge();
    currentBridge = agentRuntime;
    bridges.set(agentRuntime.getSnapshot().conversation.id, agentRuntime);
    return null;
  }
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding}
      unstable_agentFactory={({ threadId }) => {
        const agent = new CancellationAwareHttpAgent({ url: "http://example.test/agent", threadId,
          fetch: async (_url, init) => {
            const input = JSON.parse(String(init.body)) as Stream["input"];
            const encoder = new TextEncoder();
            let controller!: ReadableStreamDefaultController<Uint8Array>;
            const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
            const emit = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            const finish = (outcome?: Record<string, unknown>) => {
              emit({ type: "TEXT_MESSAGE_END", messageId: `${threadId}-answer` });
              emit({ type: "RUN_FINISHED", threadId, runId: input.runId, ...(outcome === undefined ? {} : { outcome }) });
              controller.close();
            };
            streams.set(threadId, { input, emit, finish, fail() { emit({ type: "RUN_ERROR", message: "A failed" }); controller.close(); } });
            emit({ type: "RUN_STARTED", threadId, runId: input.runId });
            emit({ type: "TEXT_MESSAGE_START", messageId: `${threadId}-answer`, role: "assistant" });
            init.signal?.addEventListener("abort", () => controller.error(new Error("BodyStreamBuffer was aborted")), { once: true });
            return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
          },
        });
        vi.spyOn(agent, "abortRun");
        agents.set(threadId, agent);
        return agent;
      }}><Capture /></ConversationRuntimeProvider>);
    await tick();
  });
  const switchTo = async (id: string) => {
    await act(async () => { await navigation.switchToThread(id); });
    expect(runtime.threads.mainItem.getState().remoteId).toBe(id);
    expect(currentBridge.getSnapshot().conversation.id).toBe(id);
  };
  const start = async (id: string) => {
    await switchTo(id);
    await act(async () => {
      runtime.thread.append({ role: "user", content: [{ type: "text", text: id === "A" ? "AAA" : "BBB" }], startRun: true });
      await until(() => streams.has(id));
    });
  };
  const emit = async (id: string, event: Record<string, unknown>) => {
    await act(async () => { streams.get(id)!.emit(event); await tick(); });
  };
  const text = (id: string) => runtime.threads.getById(id).getState().messages.flatMap(m => m.content).filter(p => p.type === "text").map(p => p.text).join("|");
  return { agents, streams, bridges, runtime, load, switchTo, start, emit, text,
    get navigation() { return navigation; },
    get currentBridge() { return currentBridge; },
    async dispose() { await act(async () => { for (const agent of agents.values()) agent.abortRun(); renderer.unmount(); await tick(); }); },
  };
}

describe("upstream-owned concurrent AG-UI threads", () => {
  it("deletes non-current B while preserving A's running session and subsequent tokens", async () => {
    const persistence = createPersistenceFixture();
    persistence.persistThread("B");
    const f = await fixture(false, persistence.binding);
    try {
      await f.switchTo("B");
      await f.start("A");
      const threadA = f.runtime.thread;
      const agentA = f.agents.get("A");
      const bridgeA = f.bridges.get("A");
      const messagesA = threadA.getState().messages;
      const loadCount = persistence.loadThread.mock.calls.length;
      await act(async () => { await f.runtime.threads.getItemById("B").delete(); await tick(); });
      expect(f.runtime.threads.getState().mainThreadId).toBe("A");
      expect(f.runtime.thread).toBe(threadA);
      expect(f.runtime.thread.getState().messages).toEqual(messagesA);
      expect(f.runtime.thread.getState().isRunning).toBe(true);
      expect(f.agents.get("A")).toBe(agentA);
      expect(f.bridges.get("A")).toBe(bridgeA);
      expect(agentA!.abortRun).not.toHaveBeenCalled();
      expect(persistence.loadThread).toHaveBeenCalledTimes(loadCount);
      await act(async () => { await f.runtime.threads.reload(); });
      expect(f.runtime.threads.getState().threadIds).not.toContain("B");
      await f.emit("A", { type: "TEXT_MESSAGE_CONTENT", messageId: "A-answer", delta: "after B deletion" });
      expect(f.text("A")).toContain("after B deletion");
      expect(f.runtime.thread.getState().isRunning).toBe(true);
    } finally { await f.dispose(); }
  });
  it("reloads a newly persisted C from history without restarting background A", async () => {
    const persistence = createPersistenceFixture();
    const { loadThread, readHistory } = persistence;
    const f = await fixture(false, persistence.binding);
    try {
      await f.start("A");
      const agentA = f.agents.get("A");
      const bridgeA = f.bridges.get("A");
      await act(async () => { await f.navigation.switchToNewThread(); });
      const idC = f.currentBridge.getSnapshot().conversation.id;
      await act(async () => {
        f.runtime.thread.append({ role: "user", content: [{ type: "text", text: "request C" }], startRun: true });
        await until(() => f.streams.has(idC));
      });
      expect(f.runtime.threads.mainItem.getState().remoteId).toBe(idC);
      expect(persistence.ephemeralIds.has(idC)).toBe(true);
      expect(persistence.persistedIds.has(idC)).toBe(false);
      expect(readHistory.mock.calls.filter(([id]) => id === idC)).toHaveLength(0);
      await f.emit(idC, { type: "TEXT_MESSAGE_CONTENT", messageId: `${idC}-answer`, delta: `complete ${idC}` });
      await act(async () => { persistence.persistThread(idC); });
      expect(persistence.persistedIds.has(idC)).toBe(true);
      expect(persistence.ephemeralIds.has(idC)).toBe(false);
      expect(f.runtime.thread.getState().isRunning).toBe(true);
      await act(async () => { f.streams.get(idC)!.finish(); await tick(); });
      await f.switchTo("A");
      const messagesA = f.runtime.thread.getState().messages;
      await f.switchTo(idC);
      expect(persistence.activateThread).toHaveBeenLastCalledWith(idC);
      const oldAgentC = f.agents.get(idC);
      await act(async () => { await f.navigation.reloadCurrentThread(); });
      expect(loadThread).toHaveBeenCalledWith(idC);
      expect(readHistory.mock.calls.filter(([id]) => id === idC)).toHaveLength(1);
      expect(f.runtime.thread.getState().messages.map(message => message.id)).toEqual([`${idC}-user`, `${idC}-answer`]);
      expect(f.text(idC)).toContain(`complete ${idC}`);
      expect(f.agents.get(idC)).not.toBe(oldAgentC);
      await f.switchTo("A");
      await f.switchTo(idC);
      expect(f.text(idC)).toContain(`complete ${idC}`);
      expect(readHistory.mock.calls.filter(([id]) => id === idC)).toHaveLength(1);
      expect(f.agents.get("A")).toBe(agentA);
      expect(f.bridges.get("A")).toBe(bridgeA);
      expect(agentA!.abortRun).not.toHaveBeenCalled();
      expect(f.runtime.threads.getById("A").getState().messages).toEqual(messagesA);
      expect(f.runtime.threads.getById("A").getState().isRunning).toBe(true);
      await f.emit("A", { type: "TEXT_MESSAGE_CONTENT", messageId: "A-answer", delta: "after C reload" });
      expect(f.text("A")).toContain("after C reload");
      expect(f.text(idC)).not.toContain("after C reload");
    } finally { await f.dispose(); }
  });

  it("switches to B with loaded history and projects the committed bridge", async () => {
    const f = await fixture();
    try {
      // act flushes the React commit that projects CurrentConversationBridge;
      // bridge readiness is not part of the navigation Promise contract.
      await act(async () => { await f.navigation.switchToThread("B"); });
      expect(f.runtime.threads.getState().mainThreadId).toBe("B");
      expect(f.text("B")).toContain("history B");
      expect(f.currentBridge).toBe(f.bridges.get("B"));
      expect(f.currentBridge.getSnapshot().conversation.id).toBe("B");
      expect(f.load.mock.calls.filter(([id]) => id === "B")).toHaveLength(1);
      await f.switchTo("A");
      await f.switchTo("B");
      expect(f.load.mock.calls.filter(([id]) => id === "B")).toHaveLength(1);
    } finally { await f.dispose(); }
  });
  it("keeps two independent runtimes, agents and running ThreadList items", async () => {
    const f = await fixture();
    try {
      await f.start("A"); await f.start("B");
      expect(f.agents.get("A")).not.toBe(f.agents.get("B"));
      expect(f.runtime.threads.getById("A")).not.toBe(f.runtime.threads.getById("B"));
      expect(f.bridges.get("A")).not.toBe(f.bridges.get("B"));
      for (const id of ["A", "B"]) {
        expect(f.runtime.threads.getById(id).getState().isRunning).toBe(true);
        expect(f.runtime.threads.getItemById(id).getState().isRunning).toBe(true);
      }
    } finally { await f.dispose(); }
  });
  it("isolates foreground/background tokens and retains them without history reload", async () => {
    const f = await fixture();
    try {
      await f.start("A"); await f.start("B");
      await f.emit("A", { type: "TEXT_MESSAGE_CONTENT", messageId: "A-answer", delta: "A-background" });
      expect(f.text("A")).toContain("A-background"); expect(f.text("B")).not.toContain("A-background");
      await f.emit("B", { type: "TEXT_MESSAGE_CONTENT", messageId: "B-answer", delta: "B-foreground" });
      expect(f.text("B")).toContain("B-foreground"); expect(f.text("A")).not.toContain("B-foreground");
      const loads = f.load.mock.calls.length;
      await f.switchTo("A");
      expect(f.text("A")).toContain("A-background"); expect(f.load).toHaveBeenCalledTimes(loads);
    } finally { await f.dispose(); }
  });
  it("cancels only B while A continues streaming", async () => {
    const f = await fixture();
    try {
      await f.start("A"); await f.start("B");
      await act(async () => { f.runtime.thread.cancelRun(); await tick(); });
      expect(f.agents.get("B")!.abortRun).toHaveBeenCalledOnce();
      expect(f.agents.get("A")!.abortRun).not.toHaveBeenCalled();
      await f.emit("A", { type: "TEXT_MESSAGE_CONTENT", messageId: "A-answer", delta: "still alive" });
      expect(f.text("A")).toContain("still alive"); expect(f.runtime.threads.getById("A").getState().isRunning).toBe(true);
    } finally { await f.dispose(); }
  });
  it("keeps background errors out of the current bridge", async () => {
    const f = await fixture();
    try {
      await f.start("A"); await f.start("B");
      await act(async () => { f.streams.get("A")!.fail(); await tick(); });
      expect(f.bridges.get("A")!.getSnapshot().run.status).toBe("error");
      expect(f.bridges.get("B")!.getSnapshot().run.status).toBe("running");
    } finally { await f.dispose(); }
  });
  it("isolates state, tool calls and CUSTOM/application events", async () => {
    const f = await fixture();
    try {
      await f.start("A"); await f.start("B");
      const aEvents = vi.fn(); const bEvents = vi.fn();
      const unsubscribeA = f.bridges.get("A")!.subscribeApplicationEvents(aEvents);
      const unsubscribeB = f.bridges.get("B")!.subscribeApplicationEvents(bEvents);
      await f.emit("A", { type: "STATE_SNAPSHOT", snapshot: { owner: "A-stream" } });
      await f.emit("A", { type: "TOOL_CALL_START", toolCallId: "A-tool", toolCallName: "search" });
      await f.emit("A", { type: "TOOL_CALL_ARGS", toolCallId: "A-tool", delta: '{"owner":"A"}' });
      await f.emit("A", { type: "TOOL_CALL_END", toolCallId: "A-tool" });
      await f.emit("A", { type: "CUSTOM", name: "thread-owner", value: { owner: "A" } });
      expect(f.bridges.get("A")!.getSnapshot().state).toEqual({ owner: "A-stream" });
      expect(f.bridges.get("B")!.getSnapshot().state).toEqual({ owner: "B" });
      expect(f.bridges.get("A")!.getSnapshot().executions.some(e => e.id === "A-tool")).toBe(true);
      expect(f.bridges.get("B")!.getSnapshot().executions.some(e => e.id === "A-tool")).toBe(false);
      expect(aEvents).toHaveBeenCalledOnce(); expect(bEvents).not.toHaveBeenCalled();
      unsubscribeA(); unsubscribeB();
    } finally { await f.dispose(); }
  });
  it("retains A's interrupt across switches and resumes only A", async () => {
    const f = await fixture();
    try {
      await f.start("A");
      await act(async () => { f.streams.get("A")!.finish({ type: "interrupt", interrupts: [{ id: "A-approval", reason: "confirmation" }] }); await tick(); });
      expect(f.bridges.get("A")!.getSnapshot().run.status).toBe("awaiting-input");
      await f.start("B");
      expect(f.runtime.thread.getState().isRunning).toBe(true);
      await f.switchTo("A");
      expect(f.bridges.get("A")!.getSnapshot().interrupts[0]?.id).toBe("A-approval");
      const previousB = f.streams.get("B");
      await act(async () => { void f.bridges.get("A")!.resumeInterrupts([{ interruptId: "A-approval", status: "resolved" }]); await tick(); });
      expect(f.streams.get("A")!.input.resume).toMatchObject([{ interruptId: "A-approval" }]);
      expect(f.streams.get("B")).toBe(previousB);
    } finally { await f.dispose(); }
  });
  it("creates a writable new thread while A runs and reserves a separate backend ID", async () => {
    const f = await fixture();
    try {
      await f.start("A");
      await act(async () => { await f.navigation.switchToNewThread(); });
      const localId = f.runtime.threads.getState().mainThreadId;
      expect(localId).not.toBe("A");
      expect(f.runtime.threads.mainItem.getState().remoteId).toBeUndefined();
      expect(f.currentBridge).not.toBe(f.bridges.get("A"));
      const newBridge = f.currentBridge;
      const newAgent = f.agents.get(newBridge.getSnapshot().conversation.id);
      expect(f.runtime.thread.getState().isDisabled).toBe(false);
      expect(f.runtime.threads.getById("A").getState().isRunning).toBe(true);
      await act(async () => { f.runtime.thread.append({ role: "user", content: [{ type: "text", text: "new" }], startRun: true }); await tick(); });
      const remoteId = f.runtime.threads.mainItem.getState().remoteId;
      expect(remoteId).toBeDefined(); expect(remoteId).not.toBe(localId);
      expect(f.agents.get(remoteId!)!.threadId).toBe(remoteId);
      expect(f.agents.get(remoteId!)).toBe(newAgent);
      expect(f.currentBridge).toBe(newBridge);
      expect(f.runtime.threads.getState().mainThreadId).toBe(localId);
      expect(f.load.mock.calls.filter(([id]) => id === remoteId)).toHaveLength(0);
    } finally { await f.dispose(); }
  });
  it("retries a failed history runtime through the official lifecycle without stopping A", async () => {
    const f = await fixture(true);
    try {
      await f.start("A"); await f.switchTo("B");
      expect(f.runtime.thread.getState().isDisabled).toBe(true);
      expect(f.bridges.get("B")!.getSnapshot().run.status).toBe("error");
      await act(async () => { void f.runtime.threads.reloadMainThread(); await tick(); });
      expect(f.runtime.thread.getState().isDisabled).toBe(false);
      expect(f.text("B")).toContain("history B");
      expect(f.agents.get("A")!.abortRun).not.toHaveBeenCalled();
      await f.emit("A", { type: "TEXT_MESSAGE_CONTENT", messageId: "A-answer", delta: "after retry" });
      expect(f.text("A")).toContain("after retry");
    } finally { await f.dispose(); }
  });
  it("continues persisted history on the same backend conversation identity", async () => {
    const f = await fixture();
    try {
      await f.switchTo("B");
      expect(f.runtime.thread.getState().isDisabled).toBe(false);
      expect(f.text("B")).toContain("history B");
      await f.start("B");
      expect(f.streams.get("B")!.input.threadId).toBe("B");
      expect(f.agents.get("B")!.threadId).toBe("B");
    } finally { await f.dispose(); }
  });
});
