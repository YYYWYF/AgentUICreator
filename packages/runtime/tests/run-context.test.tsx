import { HttpAgent, type RunAgentInput } from "@ag-ui/client";
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import {
  ConversationRuntimeProvider, createEphemeralConversationThreadBinding,
  useConversationRuntimeBridge, type ConversationRuntimeBridge,
  type ConversationRuntimeProviderProps, type ConversationRunContextGetter,
} from "../src/public.js";

async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error("Run context fixture did not settle");
}

async function fixture(getRunContext?: ConversationRunContextGetter, interrupt = false) {
  const requests: RunAgentInput[] = [];
  const errors = vi.fn();
  const threadBinding = createEphemeralConversationThreadBinding();
  const agentFactory = vi.fn(({ endpoint, threadId }: { endpoint: string; threadId: string }) => new HttpAgent({
    url: endpoint, threadId, fetch: async (_url, init) => {
      const input = JSON.parse(String(init.body)) as RunAgentInput;
      requests.push(input);
      const identity = { threadId: input.threadId, runId: input.runId };
      const messageId = `answer-${requests.length}`;
      const frames = [
        { type: "RUN_STARTED", ...identity },
        { type: "TEXT_MESSAGE_START", messageId, role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId, delta: "Answer" },
        { type: "TEXT_MESSAGE_END", messageId },
        { type: "RUN_FINISHED", ...identity, outcome: interrupt && requests.length === 1
          ? { type: "interrupt", interrupts: [{ id: "confirm", reason: "confirmation" }] }
          : { type: "success" } },
      ];
      return new Response(frames.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
    },
  }));
  let native!: AssistantRuntime, bridge!: ConversationRuntimeBridge;
  function Capture() {
    native = useAui().threads.__internal_getAssistantRuntime!();
    bridge = useConversationRuntimeBridge();
    return null;
  }
  const view = (getter: ConversationRuntimeProviderProps["getRunContext"]) => (
    <ConversationRuntimeProvider endpoint="https://example.test/agent" threadBinding={threadBinding}
      getRunContext={getter} onError={errors} unstable_agentFactory={agentFactory}><Capture /></ConversationRuntimeProvider>
  );
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(view(getRunContext)); });
  await until(() => native !== undefined && !native.thread.getState().isLoading);
  return {
    requests, errors, agentFactory,
    get native() { return native; }, get bridge() { return bridge; },
    async update(getter: ConversationRuntimeProviderProps["getRunContext"]) { await act(async () => { tree.update(view(getter)); }); },
    async send(text: string) {
      let sent!: Promise<void>;
      const count = requests.length;
      await act(async () => { sent = bridge.agentRuntime.sendMessage(text); void sent.catch(() => {}); });
      await until(() => requests.length > count && !native.thread.getState().isRunning);
      await sent;
    },
    async close() { await act(async () => tree.unmount()); },
  };
}

describe("public Host run context", () => {
  it("appends Host entries after system context with the converted transcript and run config", async () => {
    const getRunContext = vi.fn<ConversationRunContextGetter>(({ messages, runConfig }) => [
      { description: "selectedOrder", value: JSON.stringify({ id: "order-1", userCount: messages.filter(message => message.role === "user").length, source: runConfig?.custom?.source }) },
      { description: "filters", value: "open" },
    ]);
    const f = await fixture(getRunContext);
    const unregister = f.native.registerModelContextProvider({ getModelContext: () => ({ system: "System context" }) });
    try {
      await act(async () => { f.native.thread.append({ role: "user", content: [{ type: "text", text: "Analyze order" }], runConfig: { custom: { source: "page" } } }); });
      await until(() => f.requests.length === 1 && !f.native.thread.getState().isRunning);
      expect(getRunContext).toHaveBeenCalledOnce();
      expect(getRunContext.mock.calls[0]![0].messages).toEqual(f.requests[0]!.messages);
      expect(f.requests[0]!.context).toEqual([
        { description: "system", value: "System context" },
        { description: "selectedOrder", value: '{"id":"order-1","userCount":1,"source":"page"}' },
        { description: "filters", value: "open" },
      ]);
      expect(f.requests[0]!.messages.filter(message => message.role === "user")).toMatchObject([{ content: "Analyze order" }]);
      expect(f.requests[0]!.state ?? {}).not.toHaveProperty("selectedOrder");
    } finally { unregister(); await f.close(); }
  });

  it("uses the latest callback without recreating the agent or clearing messages, and accepts removal", async () => {
    const first = vi.fn<ConversationRunContextGetter>(() => [{ description: "page", value: "one" }]);
    const second = vi.fn<ConversationRunContextGetter>(() => [{ description: "page", value: "two" }]);
    const f = await fixture(first);
    try {
      await f.send("First");
      const agentsBeforeUpdate = f.agentFactory.mock.calls.length;
      await f.update(second);
      expect(f.requests).toHaveLength(1);
      await f.send("Second");
      await f.update(undefined);
      await f.send("Third");
      expect(f.agentFactory).toHaveBeenCalledTimes(agentsBeforeUpdate);
      expect(first).toHaveBeenCalledOnce(); expect(second).toHaveBeenCalledOnce();
      expect(f.requests.map(input => input.context)).toEqual([[{ description: "page", value: "one" }], [{ description: "page", value: "two" }], []]);
      expect(new Set(f.requests.map(input => input.threadId)).size).toBe(1);
      expect(f.requests.map(input => input.messages.map(message => message.content))).toEqual([["First"], ["Second"], ["Third"]]);
      expect(f.native.thread.getState().messages.filter(message => message.role === "user")).toHaveLength(3);
    } finally { await f.close(); }
  });

  it.each([false, true])("reports a getter failure without rejecting the run or resume (resume=%s)", async resume => {
    const failure = new Error("Page context unavailable");
    let fail = !resume;
    const getRunContext = vi.fn<ConversationRunContextGetter>(() => {
      if (fail) throw failure;
      return [{ description: "page", value: "before" }];
    });
    const f = await fixture(getRunContext, resume);
    try {
      await f.send("Continue even if context is unavailable");
      if (resume) {
        fail = true;
        await act(async () => { await f.bridge.agentRuntime.resumeInterrupts([{ interruptId: "confirm", status: "resolved", payload: { approved: true } }]); });
        await until(() => f.requests.length === 2 && !f.native.thread.getState().isRunning);
        expect(f.requests[1]!.resume).toEqual([{ interruptId: "confirm", status: "resolved", payload: { approved: true } }]);
      }
      expect(f.requests.at(-1)!.context).toEqual([]);
      expect(f.errors).toHaveBeenCalledExactlyOnceWith(failure);
      expect(f.bridge.agentRuntime.getSnapshot().run.status).toBe("idle");
      expect(f.native.thread.getState().messages.at(-1)?.status?.type).toBe("complete");
      expect(getRunContext).toHaveBeenCalledTimes(resume ? 2 : 1);
    } finally { await f.close(); }
  });

  it("reads fresh context on an interrupt resume", async () => {
    const f = await fixture(() => [{ description: "order", value: "before" }], true);
    try {
      await f.send("Approve this order");
      const agentsBeforeUpdate = f.agentFactory.mock.calls.length;
      await f.update(() => [{ description: "order", value: "after" }]);
      await act(async () => { await f.bridge.agentRuntime.resumeInterrupts([{ interruptId: "confirm", status: "resolved", payload: { approved: true } }]); });
      await until(() => f.requests.length === 2 && !f.native.thread.getState().isRunning);
      expect(f.requests.map(input => input.context)).toEqual([[{ description: "order", value: "before" }], [{ description: "order", value: "after" }]]);
      expect(f.requests[1]!.threadId).toBe(f.requests[0]!.threadId);
      expect(f.agentFactory).toHaveBeenCalledTimes(agentsBeforeUpdate);
    } finally { await f.close(); }
  });
});
