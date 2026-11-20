import { RunAgentInputSchema } from "@ag-ui/core/schemas";
import type { RunAgentInput } from "@ag-ui/client";
import type { AgentUserInput } from "@za38.03/agent-ui-core";
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AgentUIProvider, AgentUIConversationBinding, ConversationRuntimeProvider,
  InvalidAgentInputError, UnsupportedAgentInputError,
  createAgentUIFrontendTools, createEphemeralConversationThreadBinding, useAgent,
  type AgentUIHost, type AgentUISendOptions, type AttachmentConfig} from "../src/public.js";

afterEach(() => vi.unstubAllGlobals());

async function until(predicate: () => boolean) {
  await act(async () => { await vi.waitFor(() => expect(predicate()).toBe(true)); });
}

type Reply = (input: RunAgentInput, index: number, init: RequestInit) => object[] | Response;
async function fixture(reply?: Reply, attachments?: AttachmentConfig) {
  let host!: AgentUIHost, native!: AssistantRuntime, tree!: ReactTestRenderer;
  const requests: RunAgentInput[] = [], urls: string[] = [], errors = vi.fn();
  const tools = createAgentUIFrontendTools([
    { name: "confirm", description: "Confirm", inputSchema: { type: "object" }, execute: () => "confirmed" },
  ]);
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const input = RunAgentInputSchema.parse(JSON.parse(String(init.body))) as RunAgentInput;
    requests.push(input); urls.push(url);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer user-token");
    expect(init.credentials).toBe("include");
    const result = reply?.(input, requests.length, init) ?? [];
    if (result instanceof Response) return result;
    const terminal = result.some(event => "type" in event && (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR"));
    const frames = [{ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId }, ...result,
      ...(terminal ? [] : [{ type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId }])];
    return new Response(frames.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""),
      { headers: { "Content-Type": "text/event-stream" } });
  });
  function Capture() {
    host = useAgent();
    native = useAui().threads.__internal_getAssistantRuntime!();
    return <AgentUIConversationBinding />;
  }
  const threadBinding = createEphemeralConversationThreadBinding();
  await act(async () => {
    tree = create(<AgentUIProvider><ConversationRuntimeProvider
      endpoint="https://agent.test/run" fetch={fetch} threadBinding={threadBinding}
      attachments={attachments} frontendTools={tools} ctx={{ tenant: "one" }} onError={errors}
      request={{ headers: { Authorization: "Bearer user-token" }, credentials: "include" }}
    ><Capture /></ConversationRuntimeProvider></AgentUIProvider>);
  });
  await until(() => host?.getSnapshot().status === "ready" && !native.thread.getState().isLoading);
  async function settle(action: () => Promise<void>) {
    let pending!: Promise<void>;
    const before = requests.length;
    await act(async () => { pending = action(); void pending.catch(() => {}); });
    await until(() => requests.length > before && !native.thread.getState().isRunning);
    await pending;
  }
  return {
    host, native, requests, urls, errors, fetch, settle,
    send: (input: string | AgentUserInput, options?: AgentUISendOptions) => settle(() => host.sendMessage(input, options)),
    close: async () => { await act(async () => tree.unmount()); },
  };
}

const documentInput = () => ({ content: [
  { type: "text", text: "Analyze " },
  { type: "document", name: "报告.pdf", source: { type: "url", value: "https://files.test/report.pdf?signature=abc%2B123", mimeType: "application/pdf" } },
] } satisfies AgentUserInput);

describe("programmatic URL attachments through the canonical Host and HTTP runtime", () => {
  it("preserves interleaved text, media types, names, credentials and the Composer draft", async () => {
    const upload = vi.fn(async () => "https://files.test/unused.pdf");
    const fallback = vi.fn(); vi.stubGlobal("fetch", fallback);
    const f = await fixture(undefined, { dataSource: { upload } });
    try {
      await act(async () => {
        f.native.thread.composer.setText("Keep this draft");
        await f.native.thread.composer.addAttachment(new File(["draft"], "draft.txt", { type: "text/plain" }));
      });
      const threadId = f.host.getSnapshot().runtime!.conversation.id;
      const input: AgentUserInput = { content: [
        ...documentInput().content,
        { type: "text", text: "\nCompare with " },
        { type: "image", name: "截图.png", source: { type: "url", value: "https://files.test/image.png", mimeType: "image/png" } },
        { type: "audio", name: "audio.mp3", source: { type: "url", value: "https://files.test/audio.mp3", mimeType: "audio/mpeg" } },
        { type: "video", name: "video.mp4", source: { type: "url", value: "https://files.test/video.mp4", mimeType: "video/mp4" } },
        { type: "text", text: "\nThanks" },
      ] };
      await f.send(input, { endpoint: "https://agent.test/analyze", ctx: { task: "review" } });
      const content = [
        { type: "text", text: "Analyze " },
        { type: "document", source: { type: "url", value: "https://files.test/report.pdf?signature=abc%2B123", mimeType: "application/pdf" }, metadata: { filename: "报告.pdf" } },
        { type: "text", text: "\nCompare with " },
        { type: "image", source: { type: "url", value: "https://files.test/image.png", mimeType: "image/png" }, metadata: { filename: "截图.png" } },
        { type: "audio", source: { type: "url", value: "https://files.test/audio.mp3", mimeType: "audio/mpeg" }, metadata: { filename: "audio.mp3" } },
        { type: "video", source: { type: "url", value: "https://files.test/video.mp4", mimeType: "video/mp4" }, metadata: { filename: "video.mp4" } },
        { type: "text", text: "\nThanks" },
      ];
      expect(f.requests[0]!.messages).toMatchObject([{ role: "user", content }]);
      expect(f.requests[0]!.threadId).toBe(threadId);
      expect(f.requests[0]!.forwardedProps.ctx).toEqual({ tenant: "one", task: "review" });
      expect(f.urls).toEqual(["https://agent.test/analyze"]);
      const user = f.native.thread.getState().messages.find(message => message.role === "user");
      expect(user?.role === "user" && user.attachments).toHaveLength(4);
      expect(f.host.getSnapshot().runtime!.messages[0]!.content).toEqual([
        { type: "text", text: "Analyze " },
        { type: "document", filename: "报告.pdf", source: content[1]!.source },
        { type: "text", text: "\nCompare with " },
        { type: "image", filename: "截图.png", url: "https://files.test/image.png" },
        { type: "audio", filename: "audio.mp3", source: content[4]!.source },
        { type: "video", filename: "video.mp4", source: content[5]!.source },
        { type: "text", text: "\nThanks" },
      ]);
      expect(f.native.thread.composer.getState()).toMatchObject({ text: "Keep this draft", attachments: [{ name: "draft.txt" }] });
      expect(upload).not.toHaveBeenCalled(); expect(fallback).not.toHaveBeenCalled();
      await f.send("Next");
      expect(f.requests[1]!.threadId).toBe(threadId);
      expect(f.requests[1]!.messages).toMatchObject([{ role: "user", content: "Next" }]);
      expect(f.urls[1]).toBe("https://agent.test/run");
    } finally { await f.close(); }
  });

  it("sends attachment-only messages through a Thread handle and resolves relative URLs", async () => {
    vi.stubGlobal("location", { href: "https://host.test/app/" });
    const f = await fixture();
    try {
      const threadId = f.host.getSnapshot().runtime!.conversation.id;
      await f.settle(() => f.host.thread(threadId).sendMessage({ content: [
        { type: "image", source: { type: "url", value: "/files/image.png" } },
        { type: "document", source: { type: "url", value: "report.txt" } },
      ] }));
      expect(f.requests[0]!.messages).toMatchObject([{ role: "user", content: [
        { type: "image", source: { type: "url", value: "https://host.test/files/image.png" } },
        { type: "document", source: { type: "url", value: "https://host.test/app/report.txt", mimeType: "application/octet-stream" } },
      ] }]);
      expect(f.requests[0]!.threadId).toBe(threadId);
    } finally { await f.close(); }
  });

  it("preserves text-only concatenation and treats empty input as a no-op", async () => {
    const f = await fixture();
    try {
      for (const input of ["", { content: [] }, { content: [{ type: "text" as const, text: "" }] }]) await f.host.sendMessage(input);
      expect(f.requests).toHaveLength(0); expect(f.native.thread.getState().messages).toHaveLength(0);
      await f.send({ content: [{ type: "text", text: " A " }, { type: "text", text: "B\n" }] });
      expect(f.requests[0]!.messages).toMatchObject([{ role: "user", content: " A B\n" }]);
    } finally { await f.close(); }
  });

  it("snapshots caller input and preserves MIME parameters without fetching the attachment", async () => {
    const f = await fixture();
    try {
      const input: AgentUserInput = { content: [
        { type: "document", name: "original.txt", source: { type: "url", value: "http://files.test/original.txt", mimeType: "Text/Plain; charset=UTF-8" } },
      ] };
      const original = input.content;
      let pending!: Promise<void>;
      await act(async () => {
        pending = f.host.sendMessage(input);
        if (Array.isArray(original) && original[0]?.type === "document") {
          original[0].name = "changed.txt";
          original[0].source.value = "https://files.test/changed.txt";
        }
      });
      await until(() => f.requests.length === 1 && !f.native.thread.getState().isRunning);
      await pending;
      expect(f.requests[0]!.messages).toMatchObject([{ role: "user", content: [
        { type: "document", source: { type: "url", value: "http://files.test/original.txt", mimeType: "text/plain; charset=UTF-8" }, metadata: { filename: "original.txt" } },
      ] }]);
      expect(f.fetch).toHaveBeenCalledTimes(1);
    } finally { await f.close(); }
  });

  it.each(["", "javascript:alert(1)", "blob:local", "data:application/pdf;base64,AA==", "C:\\资料\\报告.pdf", "file:///C:/report.pdf"])(
    "rejects an unusable URL before mutating messages: %s", async value => {
      const f = await fixture();
      try {
        await expect(f.host.sendMessage({ content: [
          { type: "text", text: "Keep atomic" }, { type: "document", source: { type: "url", value } },
        ] })).rejects.toBeInstanceOf(InvalidAgentInputError);
        expect(f.native.thread.getState().messages).toHaveLength(0); expect(f.fetch).not.toHaveBeenCalled();
        await f.send("Recover");
      } finally { await f.close(); }
    },
  );

  it.each([
    { type: "audio" as const, source: { type: "url" as const, value: "https://files.test/audio" } },
    { type: "video" as const, source: { type: "url" as const, value: "https://files.test/video", mimeType: "audio/mpeg" } },
    { type: "document" as const, source: { type: "url" as const, value: "https://files.test/report", mimeType: "image/png" } },
    { type: "image" as const, source: { type: "url" as const, value: "https://files.test/image", mimeType: "" } },
  ])("rejects missing or mismatched MIME types before sending: $type", async part => {
    const f = await fixture();
    try {
      await expect(f.host.sendMessage({ content: [part] })).rejects.toMatchObject({ code: "AGENT_UI_INVALID_INPUT" });
      expect(f.native.thread.getState().messages).toHaveLength(0); expect(f.fetch).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });

  it("retains URL attachments on retry and keeps tools and interrupt resumes in the same Thread", async () => {
    const f = await fixture((input, index) => index === 1 ? [
      { type: "TOOL_CALL_START", toolCallId: "tool-1", toolCallName: "confirm" },
      { type: "TOOL_CALL_ARGS", toolCallId: "tool-1", delta: "{}" }, { type: "TOOL_CALL_END", toolCallId: "tool-1" },
    ] : index === 2 ? [
      { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId,
        outcome: { type: "interrupt", interrupts: [{ id: "approve", reason: "confirmation" }] } },
    ] : []);
    try {
      await f.send(documentInput(), { endpoint: "https://agent.test/review", ctx: { documentId: "report" } });
      await expect(f.host.sendMessage(documentInput())).rejects.toThrow("pending interrupts");
      await f.settle(() => f.host.resumeInterrupts([{ interruptId: "approve", status: "resolved", payload: true }]));
      const user = f.native.thread.getState().messages.find(message => message.role === "user")!;
      await act(async () => f.native.thread.startRun({ parentId: user.id }));
      await until(() => f.requests.length === 4 && !f.native.thread.getState().isRunning);
      expect(f.requests[3]!.messages).toEqual(f.requests[0]!.messages);
      expect(f.requests[1]!.messages).toMatchObject([{ role: "tool", toolCallId: "tool-1", content: "confirmed" }]);
      expect(f.requests[2]!.resume).toMatchObject([{ interruptId: "approve" }]);
      expect(f.requests[2]!.messages).toEqual([]);
      expect(new Set(f.requests.map(input => input.threadId)).size).toBe(1);
      expect(f.urls).toEqual(Array(4).fill("https://agent.test/review"));
      expect(f.requests.map(input => input.forwardedProps.ctx)).toEqual(Array(4).fill({ tenant: "one", documentId: "report" }));
      expect(f.errors).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });

  it("forwards cancellation, rejects overlapping sends and recovers from a failed run", async () => {
    let signal!: AbortSignal;
    const f = await fixture((input, index, init) => {
      if (index === 2) throw new Error("AGENT_UNAVAILABLE");
      if (index !== 1) return [];
      signal = init.signal!;
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId })}\n\n`));
        signal.addEventListener("abort", () => controller.error(new DOMException("", "AbortError")), { once: true });
      } }), { headers: { "Content-Type": "text/event-stream" } });
    });
    try {
      let pending!: Promise<void>;
      await act(async () => { pending = f.host.sendMessage(documentInput()); });
      await until(() => f.requests.length === 1 && f.native.thread.getState().isRunning);
      await expect(f.host.sendMessage(documentInput())).rejects.toMatchObject({ code: "AGENT_UI_RUNTIME_BUSY" });
      await act(async () => f.host.abortRun()); await pending;
      expect(signal.aborted).toBe(true);
      await expect(f.send(documentInput())).rejects.toThrow("AGENT_UNAVAILABLE");
      await f.send(documentInput());
      expect(new Set(f.requests.map(input => input.threadId)).size).toBe(1);
      expect(f.requests.map(input => input.messages.length)).toEqual([1, 1, 1]);
    } finally { await f.close(); }
  });

  it("rejects inline data sources atomically", async () => {
    const f = await fixture();
    try {
      await expect(f.host.sendMessage({ content: [
        { type: "text", text: "Not appended" },
        { type: "document", source: { type: "data", value: "JVBERg==", mimeType: "application/pdf" } },
      ] })).rejects.toBeInstanceOf(UnsupportedAgentInputError);
      expect(f.native.thread.getState().messages).toHaveLength(0); expect(f.fetch).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });
});
