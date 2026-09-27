import { HttpAgent, RunAgentInputSchema, type InputContent, type RunAgentInput } from "@ag-ui/client";
import { useAui, type AssistantRuntime, type AttachmentAdapter, type ThreadMessage } from "@assistant-ui/react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ConversationRuntimeProvider, createEphemeralConversationThreadBinding } from "../src/index.js";
import { projectLangChainHistory } from "../src/history/langchain-history-projector.js";

// Test-only adapter: serialization remains entirely in the installed react-ag-ui.
const adapter: AttachmentAdapter = {
  accept: "image/*,application/pdf",
  async add({ file }) {
    return { id: crypto.randomUUID(), type: file.type.startsWith("image/") ? "image" : "document",
      name: file.name, contentType: file.type, file,
      status: { type: "requires-action", reason: "composer-send" } };
  },
  async remove() {},
  async send(attachment) {
    const data = Buffer.from(await attachment.file.arrayBuffer()).toString("base64");
    return { ...attachment, status: { type: "complete" }, content: attachment.type === "image"
      ? [{ type: "image", image: `data:${attachment.contentType};base64,${data}`, filename: attachment.name }]
      : [{ type: "file", data, mimeType: attachment.contentType!, filename: attachment.name }] };
  },
};

async function until(condition: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  throw new Error("Timed out waiting for attachment runtime");
}

async function fixture(attachmentAdapter?: AttachmentAdapter) {
  const requests: RunAgentInput[] = [];
  const agent = new HttpAgent({ url: "http://example.test/agent", fetch: async (_url, init) => {
    const input = RunAgentInputSchema.parse(JSON.parse(String(init.body)));
    requests.push(input);
    const events = [
      { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
      { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId },
    ];
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""),
      { headers: { "Content-Type": "text/event-stream" } });
  } });
  const run = vi.spyOn(agent, "runAgent");
  let runtime!: AssistantRuntime;
  function Capture() { runtime = useAui().threads.__internal_getAssistantRuntime!(); return null; }
  let renderer!: ReactTestRenderer;
  const binding = createEphemeralConversationThreadBinding();
  await act(async () => {
    renderer = create(<ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding}
      attachmentAdapter={attachmentAdapter} unstable_agentFactory={() => agent}><Capture /></ConversationRuntimeProvider>);
    await until(() => runtime?.thread.getState().isLoading === false);
  });
  return { runtime, run, requests, async dispose() { await act(async () => renderer.unmount()); } };
}

const imageA = () => new File(["image-a"], "a.png", { type: "image/png" });
const imageB = () => new File(["image-b"], "b.png", { type: "image/png" });
const pdf = () => new File(["%PDF-1.7"], "test.pdf", { type: "application/pdf" });
const base64 = (value: string) => Buffer.from(value).toString("base64");

const cases: { name: string; text: string; files: File[]; remove?: boolean; expected: string | InputContent[] }[] = [
  { name: "text remains a string", text: "hello", files: [], expected: "hello" },
  { name: "text and image", text: "What is this?", files: [imageA()], expected: [
    { type: "text", text: "What is this?" },
    { type: "image", source: { type: "data", value: base64("image-a"), mimeType: "image/png" }, metadata: { filename: "a.png" } },
  ] },
  { name: "text and PDF use document input", text: "Summarize this", files: [pdf()], expected: [
    { type: "text", text: "Summarize this" },
    { type: "document", source: { type: "data", value: base64("%PDF-1.7"), mimeType: "application/pdf" }, metadata: { filename: "test.pdf" } },
  ] },
  { name: "multiple attachments keep their order", text: "Compare", files: [imageA(), imageB()], expected: [
    { type: "text", text: "Compare" },
    { type: "image", source: { type: "data", value: base64("image-a"), mimeType: "image/png" }, metadata: { filename: "a.png" } },
    { type: "image", source: { type: "data", value: base64("image-b"), mimeType: "image/png" }, metadata: { filename: "b.png" } },
  ] },
  { name: "removed attachment is absent", text: "hello", files: [imageA()], remove: true, expected: "hello" },
  { name: "attachment-only send", text: "", files: [imageA()], expected: [
    { type: "image", source: { type: "data", value: base64("image-a"), mimeType: "image/png" }, metadata: { filename: "a.png" } },
  ] },
];

describe("installed assistant-ui attachment integration", () => {
  it("derives attachment capability only from the injected adapter", async () => {
    for (const supplied of [undefined, adapter]) {
      const f = await fixture(supplied);
      try { expect(f.runtime.thread.getState().capabilities.attachments).toBe(supplied !== undefined); }
      finally { await f.dispose(); }
    }
  });
  it.each(cases)("$name reaches runAgent and the standard HTTP body", async ({ text, files, remove, expected }) => {
    const f = await fixture(adapter);
    try {
      await act(async () => {
        f.runtime.thread.composer.setText(text);
        for (const file of files) await f.runtime.thread.composer.addAttachment(file);
        if (remove) await f.runtime.thread.composer.removeAttachment(f.runtime.thread.composer.getState().attachments[0]!.id);
      });
      await act(async () => {
        f.runtime.thread.composer.send();
        await until(() => f.requests.length === 1 && !f.runtime.thread.getState().isRunning);
      });
      // Spy calls the real agent; neither the converter nor runAgent is mocked.
      const call = f.run.mock.calls[0]![0]!;
      expect(call.messages?.at(-1)).toMatchObject({ role: "user", content: expected });
      const user = f.requests[0]!.messages.at(-1)!;
      expect(user.role).toBe("user");
      expect(user.content).toEqual(expected);
      expect(f.runtime.thread.composer.getState().attachments).toHaveLength(0);
      const sent = f.runtime.thread.getState().messages.find(message => message.role === "user");
      if (sent?.role !== "user") throw new Error("User message missing");
      expect(sent.attachments).toHaveLength(remove ? 0 : files.length);
    } finally { await f.dispose(); }
  });
});

it("restores multimodal HumanMessage through the official history converter", () => {
  const image = "data:image/png;base64,aW1hZ2U=";
  const messages = projectLangChainHistory([{ id: "history-multimodal", type: "human", content: [
    { type: "text", text: "Describe" },
    { type: "image_url", image_url: { url: image } },
    { type: "file", mime_type: "application/pdf", data: "JVBERi0xLjc=", metadata: { filename: "test.pdf" } },
  ] }]);
  expect(messages[0]).toMatchObject({ role: "user" });
  const message = messages[0]! as unknown as ThreadMessage;
  // Upstream may lift non-text parts to attachments; both are public message state.
  const parts = [...message.content, ...(message.role === "user" ? message.attachments.flatMap(a => a.content) : [])];
  expect(parts).toContainEqual({ type: "text", text: "Describe" });
  expect(parts).toContainEqual(expect.objectContaining({ type: "image", image }));
  expect(parts).toContainEqual(expect.objectContaining({ type: "file", mimeType: "application/pdf", data: "JVBERi0xLjc=" }));
});
