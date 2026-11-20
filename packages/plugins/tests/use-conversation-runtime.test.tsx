// @vitest-environment jsdom
import { HttpAgent, type RunAgentInput } from "@ag-ui/client";
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { ConversationRuntimeProvider, type ConversationThreadBinding } from "@za38.03/agent-ui-runtime";
import { useConversation, type ConversationThreadController } from "../src/index.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error("Conversation Runtime did not settle");
}

it("shares canonical streaming messages and follows Thread navigation without rerendering unrelated readers", async () => {
  let native!: AssistantRuntime;
  let conversation!: ConversationThreadController;
  const renders = { immediate: 0, loading: 0, messages: 0 };
  let active = "A";
  let input!: RunAgentInput;
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const emit = (event: Record<string, unknown>) => stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
  const binding: ConversationThreadBinding = {
    getThreadId: () => active,
    activateThread(id) { active = id; },
    subscribe: () => () => {},
    createNewThread: async () => "new",
    getThreadListSnapshot: () => ({
      isLoading: false,
      threads: [{ id: "A", status: "regular" }, { id: "B", status: "regular" }],
      archivedThreads: [],
    }),
    loadThread: async id => ({ messages: [{
      id: `history-${id}`, role: "assistant", content: [{ type: "text", text: `History ${id}` }],
      createdAt: new Date(0), status: { type: "complete", reason: "stop" }, metadata: { custom: {} },
    }] }),
  };
  function Capture() { native = useAui().threads.__internal_getAssistantRuntime!(); return null; }
  function Immediate() { conversation = useConversation(); renders.immediate++; return null; }
  function Loading() { useConversation(state => state.threads.isLoading); renders.loading++; return null; }
  function Messages() {
    const messages = useConversation(state => state.thread.messages);
    renders.messages++;
    return <span>{messages.flatMap(message => message.content).map(part => typeof part.text === "string" ? part.text : "").join("|")}</span>;
  }
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding}
      unstable_agentFactory={({ threadId }) => new HttpAgent({ url: "http://example.test/agent", threadId,
        fetch: async (_url, init) => {
          input = JSON.parse(String(init.body)) as RunAgentInput;
          const body = new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } });
          emit({ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId });
          emit({ type: "TEXT_MESSAGE_START", messageId: "streamed", role: "assistant" });
          emit({ type: "TEXT_MESSAGE_CONTENT", messageId: "streamed", delta: "Hello" });
          return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
        },
      })}>
      <Capture /><Immediate /><Loading /><Messages />
    </ConversationRuntimeProvider>,
  ));
  await until(() => !!native && !native.thread.getState().isLoading && host.textContent === "History A");
  const before = { ...renders };
  await act(async () => { native.thread.append("Question"); });
  await until(() => host.textContent?.includes("Hello") === true);
  const beforeDelta = renders.messages;
  await act(async () => emit({ type: "TEXT_MESSAGE_CONTENT", messageId: "streamed", delta: " world" }));
  await until(() => host.textContent?.includes("Hello world") === true);
  expect(renders.messages).toBeGreaterThan(beforeDelta);
  expect(renders.immediate).toBe(before.immediate);
  expect(renders.loading).toBe(before.loading);
  expect(conversation.getSnapshot().isRunning).toBe(true);
  expect(conversation.getSnapshot().messages.at(-1)?.content).toEqual([{ type: "text", text: "Hello world" }]);
  await act(async () => {
    emit({ type: "TEXT_MESSAGE_END", messageId: "streamed" });
    emit({ type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId });
    stream.close();
  });
  await until(() => !conversation.getSnapshot().isRunning);
  await act(async () => { await native.threads.switchToThread("B"); });
  await until(() => host.textContent === "History B");
  expect(conversation.getSnapshot().messages[0]?.id).toBe("history-B");
});
