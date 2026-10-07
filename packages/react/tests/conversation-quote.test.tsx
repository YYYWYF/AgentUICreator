// @vitest-environment jsdom
import { useAui, ComposerPrimitive, type AssistantRuntime } from "@assistant-ui/react";
import type { RunAgentInput } from "@ag-ui/client";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ConversationRuntimeProvider, type ConversationAgentFactoryConfig, type ConversationThreadBinding, type ConversationMessage } from "@agent-ui/runtime-conversation";
import { CancellationAwareHttpAgent } from "../../runtime-conversation/src/compatibility/cancellation-aware-http-agent.js";
import { AgentUIRoot, ConversationThread, ConversationCanonicalComposer, ConversationComposerQuotePreview, ConversationQuoteSelectionToolbar, useConversationQuoteLifecycle } from "../src/index.js";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  throw new Error("Timed out waiting for quote UI");
}
function Feature() {
  useConversationQuoteLifecycle();
  return <><ConversationComposerQuotePreview dismissLabel="Dismiss quote" /><ConversationQuoteSelectionToolbar quoteLabel="Quote" /></>;
}
async function mount(disabled = false, history: readonly ConversationMessage[] = []) {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value() {} });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => ({ top: 100, left: 100, width: 80 } as DOMRect) });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  let runtime!: AssistantRuntime;
  const requests: RunAgentInput[] = [];
  let installed = true;
  const captureFetch: typeof fetch = async (_url, init) => {
    const input = JSON.parse(String(init?.body)) as RunAgentInput; requests.push(input);
    return new Response([
      { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
      { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  };
  const agents = new Map<string, CancellationAwareHttpAgent>();
  const agentFactory = ({ endpoint, threadId }: ConversationAgentFactoryConfig) => {
    let agent = agents.get(threadId);
    if (agent === undefined) {
      agent = new CancellationAwareHttpAgent({ url: endpoint, threadId, fetch: captureFetch });
      agents.set(threadId, agent);
    }
    return agent;
  };
  let activeThreadId = "history";
  const binding: ConversationThreadBinding = {
    getThreadId: () => activeThreadId,
    activateThread(threadId) { activeThreadId = threadId; },
    getThreadListSnapshot: () => ({
      isLoading: false,
      threads: [
        { id: "history", status: "regular", title: "Thread A" },
        { id: "B", status: "regular", title: "Thread B" },
      ],
      archivedThreads: [],
    }),
    subscribe: () => () => {}, createNewThread: async () => "new", getThreadIsDisabled: () => disabled,
    async loadThread(threadId) {
      if (threadId !== "history" && threadId !== "B") throw new Error(`Unknown test thread ${threadId}`);
      return { messages: [...history, {
        id: threadId === "history" ? "assistant" : "assistant-B", role: "assistant",
        content: [{ type: "text", text: threadId === "history" ? "Actions simplify asynchronous state changes." : "Thread B history." }],
        createdAt: new Date(0), status: { type: "complete", reason: "stop" }, metadata: { custom: {} },
      }] };
    },
  };
  function Capture() { runtime = useAui().threads.__internal_getAssistantRuntime!(); return null; }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const render = () => root!.render(<ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding} unstable_agentFactory={agentFactory}>
    <AgentUIRoot theme="light"><Capture /><ConversationThread autoFocus={false} composer={<ConversationCanonicalComposer autoFocus={false} beforeInput={installed ? <Feature /> : null} submitAction={<ComposerPrimitive.Send aria-label="Send" />} />} /></AgentUIRoot>
  </ConversationRuntimeProvider>);
  await act(async () => { render(); });
  await act(async () => until(() => !runtime.thread.getState().isLoading && host.textContent!.includes("Actions simplify")));
  const select = async () => {
    const target = host.querySelector('[data-aui-quote-selectable="true"] p')!;
    const range = document.createRange(); range.selectNodeContents(target);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    await act(async () => { document.dispatchEvent(new Event("selectionchange")); await new Promise(resolve => setTimeout(resolve, 10)); });
  };
  return { host, requests, runtime, select, remove: async () => { installed = false; await act(async () => render()); } };
}
it("selects inside the scoped Portal, dismisses, sends quote context for every turn and retains history after removal", async () => {
  const { host, requests, runtime, select, remove } = await mount();
  expect(runtime.thread.composer.getState().isEditing).toBe(true);
  await select();
  const toolbar = host.querySelector('[data-slot="selection-toolbar"]')!;
  expect(toolbar.closest("[data-agent-ui-portal-root]")).not.toBeNull();
  await act(async () => { (toolbar.querySelector("button") as HTMLButtonElement).click(); });
  expect(host.querySelector('[data-slot="composer-quote"]')).not.toBeNull();
  await act(async () => { (host.querySelector('[aria-label="Dismiss quote"]') as HTMLButtonElement).click(); });
  expect(runtime.thread.composer.getState().quote).toBeUndefined();
  await select();
  await act(async () => { (host.querySelector('[data-slot="selection-toolbar"] button') as HTMLButtonElement).click(); runtime.thread.composer.setText("Why?"); });
  await act(async () => { runtime.thread.composer.send(); await until(() => requests.length === 1 && !runtime.thread.getState().isRunning); });
  const user = runtime.thread.getState().messages.find(message => message.role === "user")!;
  expect(user.metadata.custom.quote).toEqual({ text: "Actions simplify asynchronous state changes.", messageId: "assistant" });
  expect(user.content).toEqual([{ type: "text", text: "Why?" }]);
  expect(requests[0]!.messages.find(message => message.id === user.id)!.content).toBe("> Actions simplify asynchronous state changes.\n\nWhy?");
  await act(async () => runtime.thread.composer.setQuote({ text: "Pending", messageId: "assistant" }));
  await remove();
  expect(runtime.thread.composer.getState().quote).toBeUndefined();
  expect(host.querySelector('[data-slot="composer-quote"]')).toBeNull();
  expect(host.querySelector('[data-slot="quote-block"]')!.textContent).toContain("Actions simplify");
  await select();
  expect(host.querySelector('[data-slot="selection-toolbar"]')).toBeNull();
  await act(async () => { runtime.thread.composer.setText("Continue"); runtime.thread.composer.send(); await until(() => requests.length === 2 && !runtime.thread.getState().isRunning); });
  expect(requests[1]!.messages.find(message => message.id === user.id)!.content).toBe("> Actions simplify asynchronous state changes.\n\nWhy?");
  expect(requests[1]!.messages.filter(message => message.role === "user").at(-1)!.content).toBe("Continue");
});
it("keeps readonly history selectable without an actionable Quote toolbar", async () => {
  const { host, select } = await mount(true); await select();
  expect(host.querySelector('[data-slot="selection-toolbar"]')).toBeNull();
});

it("clears the captured Thread A composer on switching to B without clearing B's quote", async () => {
  const { runtime } = await mount();
  await act(async () => { await runtime.threads.switchToThread("B"); });
  await act(async () => until(() => !runtime.thread.getState().isLoading));
  const composerB = runtime.threads.getById("B").composer;
  await act(async () => { await runtime.threads.switchToThread("history"); });
  await act(async () => until(() => !runtime.thread.getState().isLoading));
  const composerA = runtime.threads.getById("history").composer;
  const quoteB = { text: "Pending B", messageId: "assistant-B" };
  await act(async () => {
    composerA.setQuote({ text: "Pending A", messageId: "assistant" });
    composerB.setQuote(quoteB);
  });
  await act(async () => { await runtime.threads.switchToThread("B"); });
  expect(composerA.getState().quote).toBeUndefined();
  expect(composerB.getState().quote).toEqual(quoteB);
});

it("shows Quote for an ordinary editing composer, previews and dismisses it", async () => {
  const { host, runtime, select } = await mount();
  expect(runtime.thread.composer.getState().isEditing).toBe(true);
  await select();
  const toolbar = host.querySelector('[data-slot="selection-toolbar"]');
  expect(toolbar).not.toBeNull();
  expect(toolbar!.closest("[data-agent-ui-portal-root]")).not.toBeNull();
  await act(async () => (toolbar!.querySelector("button") as HTMLButtonElement).click());
  expect(host.querySelector('[data-slot="composer-quote"]')!.textContent).toContain("Actions simplify");
  await act(async () => (host.querySelector('[aria-label="Dismiss quote"]') as HTMLButtonElement).click());
  expect(runtime.thread.composer.getState().quote).toBeUndefined();
  expect(host.querySelector('[data-slot="composer-quote"]')).toBeNull();
});

it("seeds outbound quote context from structured loaded history after removing creation UI", async () => {
  const historicalUser: ConversationMessage = {
    id: "historical-user", role: "user", content: [{ type: "text", text: "Earlier question" }],
    attachments: [], createdAt: new Date(0),
    metadata: { custom: { quote: { text: "Restored passage", messageId: "earlier-assistant" } } },
  };
  const { runtime, requests, remove } = await mount(false, [historicalUser]);
  await remove();
  await act(async () => {
    runtime.thread.composer.setText("Continue");
    runtime.thread.composer.send();
    await until(() => requests.length === 1 && !runtime.thread.getState().isRunning);
  });
  expect(requests[0]!.messages.find(message => message.id === historicalUser.id)!.content)
    .toBe("> Restored passage\n\nEarlier question");
  expect(requests[0]!.messages.filter(message => message.role === "user").at(-1)!.content).toBe("Continue");
  expect(runtime.thread.getState().messages.find(message => message.id === historicalUser.id)!.content)
    .toEqual(historicalUser.content);
});
