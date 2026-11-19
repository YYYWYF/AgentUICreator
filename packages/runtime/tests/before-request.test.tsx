import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import type { RunAgentInput } from "@ag-ui/client";
import { describe, expect, it, vi } from "vitest";
import {
  AgentUIProvider, AgentUIConversationBinding, ConversationRuntimeProvider,
  createEphemeralConversationThreadBinding, createAgentUIFrontendTools, useAgentUI,
  type AgentUIBeforeRequest, type AgentUIHost, type AgentUIRequestInput,
  type ConversationRuntimeProviderProps,
} from "../src/public.js";

async function until(predicate: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error("BEFORE_REQUEST_DID_NOT_SETTLE");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

type Props = Pick<ConversationRuntimeProviderProps, "beforeRequest" | "ctx">;
type Reply = (input: RunAgentInput, count: number) => object[];
async function fixture(props: Props, options: { initialId?: string; reply?: Reply; failFetch?: boolean } = {}) {
  let host!: AgentUIHost, native!: AssistantRuntime;
  const requests: RunAgentInput[] = [];
  const errors = vi.fn();
  const binding = createEphemeralConversationThreadBinding(options.initialId);
  const tools = createAgentUIFrontendTools([{ name: "probe", description: "probe", inputSchema: { type: "object", properties: {} }, execute: async () => ({ ok: true }) }]);
  function Capture() { host = useAgentUI(); native = useAui().threads.__internal_getAssistantRuntime!(); return <AgentUIConversationBinding />; }
  let failFetch = options.failFetch;
  const fetch: NonNullable<ConversationRuntimeProviderProps["fetch"]> = async (_url, init) => {
    const input = JSON.parse(String(init.body)) as RunAgentInput;
    requests.push(input);
    if (failFetch) { failFetch = false; throw new Error("TRANSPORT_FAILED"); }
    const events = options.reply?.(input, requests.length) ?? [];
    const terminal = events.some(event => "type" in event && (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR"));
    const frames = [{ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId }, ...events,
      ...(terminal ? [] : [{ type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId, outcome: { type: "success" } }])];
    return new Response(frames.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  };
  const view = (value: Props) => <AgentUIProvider><ConversationRuntimeProvider {...value} threadBinding={binding}
    endpoint="https://example.test/agent" fetch={fetch} frontendTools={tools} onError={errors}
    getRunContext={() => [{ description: "page", value: "context" }]}><Capture /></ConversationRuntimeProvider></AgentUIProvider>;
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(view(props)); });
  await until(() => host?.getSnapshot().status === "ready" && !native.thread.getState().isLoading);
  async function run<T>(operation: () => Promise<T>): Promise<T> {
    let settled = false;
    let outcome: { value: T } | { error: unknown } | undefined;
    await act(async () => {
      void operation().then(value => { outcome = { value }; settled = true; }, error => { outcome = { error }; settled = true; });
    });
    await until(() => settled);
    if (!outcome) throw new Error("MISSING_OUTCOME");
    if ("error" in outcome) throw outcome.error;
    return outcome.value;
  }
  return { requests, errors, binding, run,
    get host() { return host; }, get native() { return native; },
    send: (text = "hello") => run(() => host.sendMessage(text)),
    update: async (value: Props) => { await act(async () => tree.update(view(value))); },
    close: async () => { await act(async () => tree.unmount()); },
  };
}

describe("beforeRequest", () => {
  it("binds the business ID once and exposes it to later requests and Host handles", async () => {
    const inputs: AgentUIRequestInput[] = [];
    const allocate = vi.fn(async () => "business-thread");
    const beforeRequest: AgentUIBeforeRequest = async input => {
      inputs.push(input);
      return { threadId: input.threadId ?? await allocate(), runId: `business-run-${inputs.length}` };
    };
    const f = await fixture({ beforeRequest });
    try {
      const draftId = f.host.getSnapshot().runtime!.conversation.id;
      const originalHandle = f.host.thread(draftId);
      await f.send("first");
      await f.send("second");
      expect(allocate).toHaveBeenCalledOnce();
      expect(inputs.map(input => input.threadId)).toEqual([undefined, "business-thread"]);
      expect(inputs.map(input => input.runId)).toEqual([undefined, undefined]);
      expect(f.requests.map(input => [input.threadId, input.runId])).toEqual([
        ["business-thread", "business-run-1"], ["business-thread", "business-run-2"],
      ]);
      expect(f.host.getSnapshot().runtime?.conversation.id).toBe("business-thread");
      expect(f.binding.getThreadId()).toBe("business-thread");
      expect(f.host.getThreads().filter(thread => thread.conversation.id === "business-thread")).toHaveLength(1);
      expect(f.host.getThreads().some(thread => thread.conversation.id === draftId)).toBe(false);
      expect(f.host.thread("business-thread").getSnapshot().messages.filter(message => message.role === "user")).toHaveLength(2);
      expect(originalHandle.getSnapshot().conversation.id).toBe("business-thread");
      expect(() => f.host.thread(draftId)).toThrow("AGENT_UI_THREAD_NOT_FOUND");
      await f.run(() => f.host.openThread("business-thread"));
      expect(f.host.getThreads().filter(thread => thread.conversation.id === "business-thread")).toHaveLength(1);
    } finally { await f.close(); }
  });

  it("merges request fields, preserves forwarded props and replaces arrays", async () => {
    const beforeRequest = vi.fn<AgentUIBeforeRequest>(input => {
      expect(input.messages).toMatchObject([{ role: "user", content: "hello" }]);
      return { forwardedProps: { business: "request", ctx: { scene: "hook", extra: true } },
        context: [{ description: "hook", value: "replacement" }], tools: [], state: { step: 2 } };
    });
    const f = await fixture({ beforeRequest, ctx: { tenant: "one", scene: "default" } });
    const unregister = f.native.registerModelContextProvider({ getModelContext: () => ({ callSettings: { temperature: 0.4 } }) });
    try {
      await f.send();
      expect(f.requests[0]!.forwardedProps).toEqual({ temperature: 0.4, business: "request", ctx: { tenant: "one", scene: "hook", extra: true } });
      expect(f.requests[0]!.context).toEqual([{ description: "hook", value: "replacement" }]);
      expect(f.requests[0]!.tools).toEqual([]);
      expect(f.requests[0]!.state).toEqual({ step: 2 });
      expect(f.requests[0]!.threadId).toBeTruthy();
    } finally { unregister(); await f.close(); }
  });

  it("generates omitted IDs and adopts callback updates without replacing the Thread", async () => {
    const f = await fixture({ beforeRequest: () => undefined });
    try {
      const initialCount = f.host.getThreads().length;
      await f.send("one");
      const id = f.requests[0]!.threadId;
      await f.update({ beforeRequest: input => ({ threadId: undefined, forwardedProps: { savedId: input.threadId } }) });
      await f.send("two");
      expect(f.requests[1]!.threadId).toBe(id);
      expect(f.requests[1]!.runId).not.toBe(f.requests[0]!.runId);
      expect(f.requests[1]!.forwardedProps.savedId).toBe(id);
      expect(f.host.getThreads()).toHaveLength(initialCount);
    } finally { await f.close(); }
  });

  it("retains the chosen ID after transport failure and rejects later replacement", async () => {
    const allocate = vi.fn(async () => "allocated");
    const hook: AgentUIBeforeRequest = async input => ({ threadId: input.threadId ?? await allocate() });
    const f = await fixture({ beforeRequest: hook }, { failFetch: true });
    try {
      await expect(f.send()).rejects.toThrow("TRANSPORT_FAILED");
      await f.send("retry");
      expect(allocate).toHaveBeenCalledOnce();
      expect(f.requests.every(input => input.threadId === "allocated")).toBe(true);
      await f.update({ beforeRequest: () => ({ threadId: "different" }) });
      await expect(f.send("invalid change")).rejects.toThrow("AGENT_UI_THREAD_ID_ALREADY_BOUND");
      expect(f.requests).toHaveLength(2);
    } finally { await f.close(); }
  });

  it("stops failed preparation before HTTP and allows retry on the same draft", async () => {
    const beforeRequest = vi.fn<AgentUIBeforeRequest>().mockRejectedValueOnce(new Error("ID_SERVICE_FAILED"))
      .mockResolvedValue({ threadId: "recovered" });
    const f = await fixture({ beforeRequest });
    try {
      await expect(f.send()).rejects.toThrow("ID_SERVICE_FAILED");
      expect(f.requests).toHaveLength(0);
      expect(f.native.thread.getState().messages.some(message => message.role === "user")).toBe(true);
      await f.send("retry");
      expect(f.requests[0]!.threadId).toBe("recovered");
    } finally { await f.close(); }
  });

  it("cancels asynchronous preparation without late binding or HTTP", async () => {
    const pending = deferred<{ threadId: string }>();
    let signal: AbortSignal | undefined;
    const f = await fixture({ beforeRequest: (_input, options) => { signal = options.signal; return pending.promise; } });
    try {
      const draftId = f.host.getSnapshot().runtime!.conversation.id;
      let sending!: Promise<void>;
      await act(async () => { sending = f.host.sendMessage("pending"); void sending.catch(() => {}); });
      await until(() => signal !== undefined);
      await act(async () => f.host.abortRun());
      expect(signal?.aborted).toBe(true);
      await act(async () => pending.resolve({ threadId: "late" }));
      await sending;
      expect(f.requests).toHaveLength(0);
      expect(f.host.getSnapshot().runtime?.conversation.id).toBe(draftId);
      await f.update({ beforeRequest: () => ({ threadId: "active" }) });
      await f.send("after cancellation");
      expect(f.requests[0]!.threadId).toBe("active");
    } finally { await f.close(); }
  });

  it("runs on tool continuation and interrupt resume with the bound identity", async () => {
    const seen: (string | undefined)[] = [];
    const f = await fixture({ beforeRequest: input => { seen.push(input.threadId); return { threadId: input.threadId ?? "tools-thread" }; } }, {
      reply: (input, count) => count === 1 ? [
        { type: "TOOL_CALL_START", toolCallId: "probe-1", toolCallName: "probe", parentMessageId: "answer-1" },
        { type: "TOOL_CALL_ARGS", toolCallId: "probe-1", delta: "{}" }, { type: "TOOL_CALL_END", toolCallId: "probe-1" },
      ] : count === 2 ? [{ type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId,
        outcome: { type: "interrupt", interrupts: [{ id: "confirm", reason: "confirmation" }] } }] : [],
    });
    try {
      await f.send("tool");
      await until(() => f.requests.length === 2 && f.host.getSnapshot().runtime?.run.status === "awaiting-input");
      await f.run(() => f.host.resumeInterrupts([{ interruptId: "confirm", status: "resolved" }]));
      expect(seen).toEqual([undefined, "tools-thread", "tools-thread"]);
      expect(f.requests.every(input => input.threadId === "tools-thread")).toBe(true);
      expect(f.requests[2]!.resume).toMatchObject([{ interruptId: "confirm" }]);
    } finally { await f.close(); }
  });

  it("isolates new Threads and keeps the earlier one addressable in the background", async () => {
    let allocated = 0;
    const f = await fixture({ beforeRequest: input => ({ threadId: input.threadId ?? `thread-${++allocated}` }) });
    try {
      await f.send("first");
      await f.run(() => f.host.createThread());
      await f.send("second");
      await f.run(() => f.host.thread("thread-1").sendMessage("background"));
      expect(f.requests.map(input => input.threadId)).toEqual(["thread-1", "thread-2", "thread-1"]);
      expect(f.host.getSnapshot().runtime?.conversation.id).toBe("thread-2");
      await f.run(() => f.host.openThread("thread-1"));
      expect(f.host.getSnapshot().runtime?.messages.filter(message => message.role === "user")).toHaveLength(2);
    } finally { await f.close(); }
  });

  it("preserves an explicitly reopened identity", async () => {
    const hook = vi.fn<AgentUIBeforeRequest>(() => ({}));
    const f = await fixture({ beforeRequest: hook }, { initialId: "saved" });
    try {
      await f.send();
      expect(hook.mock.calls[0]![0].threadId).toBe("saved");
      expect(f.requests[0]!.threadId).toBe("saved");
    } finally { await f.close(); }
  });

});
