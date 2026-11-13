import { useAui, type AssistantRuntime, type AttachmentAdapter } from "@assistant-ui/react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationRuntimeProvider } from "../src/ConversationRuntimeProvider.js";
import { AgentUIConversationBinding } from "../src/host/AgentUIConversationBinding.js";
import { AgentUIProvider, AgentUIAgentProvider, useAgentUIAgents, type AgentUIAgents } from "../src/host/AgentUIAgentsProvider.js";
import { createAgentUIFrontendTools } from "../src/host/frontend-tools.js";
import type { AgentFrontendToolSource } from "@za38.03/agent-ui-core";
import type { ConversationThreadBinding } from "../src/threads/types.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.unstubAllGlobals());
async function until(predicate: () => boolean) {
  for (let n = 0; n < 100; n++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error("Timed out waiting for multi-Agent state");
}
async function action<T>(operation: () => Promise<T>) {
  let settled = false;
  let result!: T;
  let failure: unknown;
  await act(async () => { void operation().then(value => { result = value; settled = true; }, error => { failure = error; settled = true; }); });
  await until(() => settled);
  if (failure) throw failure;
  return result;
}
type Request = { url: string; body: { threadId: string; runId: string; messages: { content: unknown }[]; resume?: unknown[] }; init: RequestInit; emit(event: object): void; finish(outcome?: object): void };
async function fixture(bAttachmentAdapter?: AttachmentAdapter, frontendTools?: AgentFrontendToolSource) {
  let agents!: AgentUIAgents;
  const natives = new Map<string, AssistantRuntime>();
  const requests: Request[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
    let closed = false;
    const emit = (event: object) => { if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); };
    const request: Request = { url, body, init, emit, finish(outcome) {
      emit({ type: "TEXT_MESSAGE_END", messageId: body.runId });
      emit({ type: "RUN_FINISHED", threadId: body.threadId, runId: body.runId, ...(outcome ? { outcome } : {}) });
      closed = true; controller.close();
    } };
    requests.push(request);
    init.signal?.addEventListener("abort", () => { if (!closed) { closed = true; controller.error(new Error("aborted")); } }, { once: true });
    emit({ type: "RUN_STARTED", threadId: body.threadId, runId: body.runId });
    emit({ type: "TEXT_MESSAGE_START", messageId: body.runId, role: "assistant" });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
  }));
  function Group() { agents = useAgentUIAgents(); return null; }
  function Capture({ id }: { id: string }) { const aui = useAui(); natives.set(id, aui.threads.__internal_getAssistantRuntime!()); return <AgentUIConversationBinding />; }
  const binding = (): ConversationThreadBinding => ({ getThreadId: () => "same-id", loadThread: async () => ({ messages: [] }), subscribe: () => () => {}, createNewThread: async () => crypto.randomUUID() });
  const a = binding(), b = binding();
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AgentUIProvider><Group />
      <AgentUIAgentProvider agentId="a"><ConversationRuntimeProvider endpoint="https://a.test/run" frontendTools={frontendTools} request={{ headers: { Authorization: "Bearer A" } }} threadBinding={a}><Capture id="a" /></ConversationRuntimeProvider></AgentUIAgentProvider>
      <AgentUIAgentProvider agentId="b"><ConversationRuntimeProvider endpoint="https://b.test/run" request={{ headers: { Authorization: "Bearer B" } }} attachmentAdapter={bAttachmentAdapter} threadBinding={b}><Capture id="b" /></ConversationRuntimeProvider></AgentUIAgentProvider>
    </AgentUIProvider>);
  });
  await until(() => agents?.getSnapshot().agents.length === 2 && agents.getSnapshot().agents.every(instance => instance.connection.status === "ready"));
  return { agents, natives, requests, async close() { await act(async () => { tree.unmount(); }); } };
}

describe("multiple Agents over native assistant-ui threads", () => {
  it("routes sequential workflows and default sends through one Thread without replacing history", async () => {
    const f = await fixture();
    try {
      for (const [index, endpoint] of ["https://a.test/orders", "https://a.test/refund", undefined].entries()) {
        let sent!: Promise<void>;
        await act(async () => { sent = f.agents.agent("a").sendMessage( `message-${index}`, { endpoint }); void sent.catch(() => {}); });
        await until(() => f.requests.length === index + 1);
        expect(f.requests[index]!.url).toBe(endpoint ?? "https://a.test/run");
        expect(f.requests[index]!.body.threadId).toBe("same-id");
        expect(JSON.stringify(f.requests[index]!.body)).not.toContain("__agentUIRequestEndpoint");
        expect(f.requests[index]!.body.messages).toMatchObject([{ content: `message-${index}` }]);
        await act(async () => f.requests[index]!.finish()); await sent;
      }
      expect(f.agents.agent("a").getSnapshot().runtime?.conversation.id).toBe("same-id");
      expect(f.natives.get("a")!.thread.getState().messages.filter(message => message.role === "user")).toHaveLength(3);
    } finally { await f.close(); }
  });
  it("retries an earlier response at its original workflow URL", async () => {
    const f = await fixture();
    try {
      for (const endpoint of ["https://a.test/orders", "https://a.test/refund"]) {
        let sent!: Promise<void>;
        const count = f.requests.length;
        await act(async () => { sent = f.agents.agent("a").sendMessage( endpoint, { endpoint }); void sent.catch(() => {}); });
        await until(() => f.requests.length === count + 1);
        await act(async () => f.requests[count]!.finish()); await sent;
      }
      await act(async () => { f.natives.get("a")!.thread.getMessageById(f.requests[0]!.body.runId).reload(); });
      await until(() => f.requests.length === 3);
      expect(f.requests[2]!.url).toBe("https://a.test/orders");
      expect(f.requests[2]!.body.threadId).toBe("same-id");
      await act(async () => f.requests[2]!.finish());
    } finally { await f.close(); }
  });
  it("keeps frontend-tool continuations on the original workflow URL", async () => {
    const tools = createAgentUIFrontendTools([{ name: "confirm", description: "Confirm", inputSchema: { type: "object" }, execute: async () => "confirmed" }]);
    const f = await fixture(undefined, tools);
    try {
      let sent!: Promise<void>;
      await act(async () => { sent = f.agents.agent("a").sendMessage( "tool workflow", { endpoint: "https://a.test/tools" }); void sent.catch(() => {}); });
      await until(() => f.requests.length === 1);
      await act(async () => {
        f.requests[0]!.emit({ type: "TOOL_CALL_START", toolCallId: "confirm-1", toolCallName: "confirm", parentMessageId: f.requests[0]!.body.runId });
        f.requests[0]!.emit({ type: "TOOL_CALL_ARGS", toolCallId: "confirm-1", delta: "{}" });
        f.requests[0]!.emit({ type: "TOOL_CALL_END", toolCallId: "confirm-1" });
        f.requests[0]!.finish();
      });
      await until(() => f.requests.length === 2);
      expect(f.requests.map(request => request.url)).toEqual(["https://a.test/tools", "https://a.test/tools"]);
      expect(f.requests[1]!.body.threadId).toBe("same-id");
      expect(f.requests[1]!.body.messages).toMatchObject([{ role: "tool", toolCallId: "confirm-1" }]);
      await act(async () => f.requests[1]!.finish()); await sent;
    } finally { await f.close(); }
  });
  it("rejects another workflow send while the current Thread is running without aborting it", async () => {
    const f = await fixture();
    try {
      let first!: Promise<void>;
      await act(async () => { first = f.agents.agent("a").sendMessage( "running", { endpoint: "https://a.test/orders" }); void first.catch(() => {}); });
      await until(() => f.requests.length === 1);
      await expect(f.agents.agent("a").sendMessage( "second", { endpoint: "https://a.test/refund" })).rejects.toThrow(/operation/);
      expect(f.requests).toHaveLength(1);
      expect(f.requests[0]!.init.signal?.aborted).toBe(false);
      expect(f.agents.agent("a").thread("same-id").getSnapshot().run.status).toBe("running");
      await act(async () => f.requests[0]!.finish()); await first;
    } finally { await f.close(); }
  });
  it("does not replace a workflow submission while its attachment is preparing", async () => {
    let finishUpload!: () => void;
    let uploading = false;
    const adapter: AttachmentAdapter = {
      accept: "text/plain",
      async add({ file }) { return { id: crypto.randomUUID(), file, type: "file", name: file.name, status: { type: "requires-action", reason: "composer-send" } }; },
      async remove() {},
      async send(attachment) {
        uploading = true;
        await new Promise<void>(resolve => { finishUpload = resolve; });
        return { ...attachment, status: { type: "complete" }, content: [{ type: "text", text: "note" }] };
      },
    };
    const f = await fixture(adapter);
    try {
      const host = f.agents.agent("b");
      const composer = f.natives.get("b")!.thread.composer;
      await act(async () => { composer.setText("original"); await composer.addAttachment(new File(["file"], "note.txt", { type: "text/plain" })); });
      let submission!: Promise<void>;
      await act(async () => { submission = host.sendComposer({ endpoint: "https://b.test/orders" }); void submission.catch(() => {}); });
      await until(() => uploading);
      await expect(host.sendComposer({ endpoint: "https://b.test/refund" })).rejects.toThrow(/operation/);
      await act(async () => finishUpload()); await submission;
      await until(() => f.requests.length === 1);
      expect(f.requests[0]!.url).toBe("https://b.test/orders");
      expect(f.requests[0]!.body.threadId).toBe("same-id");
      await act(async () => f.requests[0]!.finish());
    } finally { await f.close(); }
  });
  it("sends the native draft in the same assistant's current Thread", async () => {
    const f = await fixture();
    try {
      const original = f.natives.get("a")!.threads.getById(f.natives.get("a")!.threads.getState().mainThreadId).composer;
      await act(async () => original.setText("new conversation"));
      await action(() => f.agents.agent("a").sendComposer());
      await until(() => f.requests.length === 1);
      expect(f.requests[0]!.body.threadId).toBe("same-id");
      expect(original.getState().text).toBe("");
      expect(f.requests[0]!.body.messages).toMatchObject([{ content: "new conversation" }]);
      await act(async () => f.requests[0]!.finish());
    } finally { await f.close(); }
  });
  it("preserves the current draft when workflow attachment preparation fails", async () => {
    const adapter: AttachmentAdapter = {
      accept: "text/plain",
      async add({ file }) { return { id: crypto.randomUUID(), file, type: "file", name: file.name, status: { type: "requires-action", reason: "composer-send" } }; },
      async remove() {}, async send() { throw new Error("upload failed"); },
    };
    const f = await fixture(adapter);
    try {
      const host = f.agents.agent("b");
      const composer = f.natives.get("b")!.thread.composer;
      await act(async () => { composer.setText("keep my draft"); await composer.addAttachment(new File(["file"], "note.txt", { type: "text/plain" })); });
      await expect(action(() => host.sendComposer({ endpoint: "https://b.test/workflow" }))).rejects.toThrow("AGENT_UI_DRAFT_NOT_SUBMITTED");
      expect(composer.getState().text).toBe("keep my draft");
      expect(composer.getState().attachments).toHaveLength(1);
      expect(f.requests).toHaveLength(0);
    } finally { await f.close(); }
  });

  it("keeps a background approval bound to its original Agent URL and credentials", async () => {
    const f = await fixture();
    try {
      const old = f.agents.agent("a").thread("same-id");
      let initial!: Promise<void>;
      await act(async () => { initial = old.sendMessage("approval", { endpoint: "https://a.test/approval-workflow" }); void initial.catch(() => {}); });
      await until(() => f.requests.length === 1);
      await act(async () => f.requests[0]!.finish({ type: "interrupt", interrupts: [{ id: "a-approval", reason: "confirmation" }] }));
      await initial;
      await action(() => f.agents.createThread("b"));
      let resumed!: Promise<void>;
      await act(async () => { resumed = old.resumeInterrupts([{ interruptId: "a-approval", status: "resolved" }]); void resumed.catch(() => {}); });
      await until(() => f.requests.length === 2);
      expect(f.requests[1]!.url).toBe("https://a.test/approval-workflow");
      expect(new Headers(f.requests[1]!.init.headers).get("Authorization")).toBe("Bearer A");
      expect(f.requests[1]!.body.threadId).toBe("same-id");
      expect(f.requests[1]!.body.resume).toMatchObject([{ interruptId: "a-approval" }]);
      await act(async () => f.requests[1]!.finish()); await resumed;
    } finally { await f.close(); }
  });
  it("isolates identical backend IDs, request credentials and concurrent streams", async () => {
    const f = await fixture();
    const first = f.agents.agent("a").thread("same-id");
    const second = f.agents.agent("b").thread("same-id");
    try {
      let a!: Promise<void>, b!: Promise<void>;
      await act(async () => { a = first.sendMessage("research"); b = second.sendMessage("write"); void a.catch(() => {}); void b.catch(() => {}); });
      await until(() => f.requests.length === 2);
      expect(f.requests.map(request => request.url)).toEqual(["https://a.test/run", "https://b.test/run"]);
      expect(f.requests.map(request => new Headers(request.init.headers).get("Authorization"))).toEqual(["Bearer A", "Bearer B"]);
      await act(async () => { f.requests[0]!.emit({ type: "TEXT_MESSAGE_CONTENT", messageId: f.requests[0]!.body.runId, delta: "A only" }); });
      await until(() => JSON.stringify(first.getSnapshot().messages).includes("A only"));
      expect(JSON.stringify(second.getSnapshot().messages)).not.toContain("A only");
      await act(async () => second.abortRun());
      await b;
      expect(second.getSnapshot().run.status).not.toBe("running");
      expect(first.getSnapshot().run.status).toBe("running");
      await act(async () => f.requests[0]!.finish()); await a;
    } finally { await f.close(); }
  });

  it("creates Threads only through explicit new-conversation actions and preserves background runs", async () => {
    const f = await fixture();
    try {
      const oldA = f.agents.agent("a").thread("same-id");
      let running!: Promise<void>;
      await act(async () => { running = oldA.sendMessage("background"); void running.catch(() => {}); });
      await until(() => f.requests.length === 1);
      const selectedB = await action(() => f.agents.createThread("b"));
      const selectedA = await action(() => f.agents.createThread("a"));
      const anotherB = await action(() => f.agents.createThread("b"));
      expect(new Set([selectedB.threadId, selectedA.threadId, anotherB.threadId, "same-id"]).size).toBe(4);
      expect(oldA.getSnapshot().run.status).toBe("running");
      await action(() => f.agents.openThread({ agentId: "a", threadId: "same-id" }));
      expect(f.agents.agent("a").getSnapshot().runtime?.conversation.id).toBe("same-id");
      await act(async () => f.requests[0]!.finish()); await running;
    } finally { await f.close(); }
  });


});
