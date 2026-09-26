// @vitest-environment jsdom

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { useAui, type AssistantRuntime, type ThreadMessage } from "@assistant-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationRuntimeProvider, type ConversationAgentFactory } from "@agent-ui/runtime-conversation";
import { createConversationServiceThreadBinding } from "../agent-ui/conversation/threads/conversation-service-thread-binding";
import { createMockConversationApiHandler } from "../dev-mock/conversations/handler";
import { zhCN } from "../agent-ui/i18n/locales/zh-CN";
import { PolicyThreadList } from "../plugins/conversation-thread-list/PolicyThreadList";
import { createConversationService, createHttpConversationDataSource } from "../services/conversations";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);
if (globalThis.PointerEvent === undefined) vi.stubGlobal("PointerEvent", MouseEvent);

let server: Server;
let endpoint: string;
let root: Root | undefined;
let cleanup: (() => void) | undefined;

beforeEach(async () => {
  const handler = createMockConversationApiHandler({ listDelayMs: 0, detailDelayMs: 0 });
  server = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/__agent-ui/mock-data`;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  cleanup?.();
  cleanup = undefined;
  document.body.replaceChildren();
  await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)));
});

async function settleUntil(condition: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    if (condition()) return;
  }
  throw new Error("Thread List interaction did not settle.");
}

async function mount() {
  const dataSource = createHttpConversationDataSource({ endpoint });
  const remove = vi.spyOn(dataSource, "delete");
  const service = createConversationService({ dataSource });
  const binding = createConversationServiceThreadBinding();
  const detach = binding.attachConversationService(service);
  cleanup = () => { detach(); service.dispose(); };
  await service.refresh();
  const liveId = binding.getThreadId();
  const abortRun = vi.fn();
  const unsubscribe = vi.fn();
  const subscribe = vi.fn(() => ({ unsubscribe }));
  const agentFactory = vi.fn<ConversationAgentFactory>(({ threadId }) => ({
    threadId, runAgent: vi.fn(), abortRun, subscribe,
  }) as never);
  let runtime: AssistantRuntime | undefined;
  function Capture() {
    runtime = useAui().threads.__internal_getAssistantRuntime?.();
    return null;
  }
  const container = document.createElement("div");
  container.className = "conversation-thread-list-plugin";
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding} unstable_agentFactory={agentFactory}>
        <Capture />
        <PolicyThreadList labels={zhCN.threadList} />
      </ConversationRuntimeProvider>,
    );
  });
  await settleUntil(() => container.textContent?.includes("历史：基础会话") === true);
  if (runtime === undefined) throw new Error("Runtime was not captured.");
  return { runtime, binding, service, container, liveId, remove, abortRun, unsubscribe, subscribe, agentFactory };
}

async function deleteFromNativeMenu(container: HTMLElement) {
  const row = Array.from(container.querySelectorAll('[data-slot="aui_thread-list-item"]'))
    .find(item => item.textContent?.includes("历史：基础会话"));
  const more = row?.querySelector<HTMLButtonElement>('[data-slot="agent-ui-thread-action-more"]');
  if (more === null || more === undefined) throw new Error("Native More trigger was not found.");
  await act(async () => {
    more.focus();
    // Use the primitive's public keyboard interaction to open the portaled menu.
    more.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });
  const selector = '[data-slot="agent-ui-thread-action-delete"]';
  await settleUntil(() => document.querySelector(selector) !== null);
  expect(document.querySelector('[data-slot="agent-ui-thread-action-rename"]')).toBeNull();
  expect(document.querySelector('[data-slot="agent-ui-thread-action-archive"]')).toBeNull();
  await act(async () => {
    document.querySelector<HTMLElement>(selector)!.click();
  });
}

describe("assistant-ui native Thread Delete persistence", () => {
  it("deletes a background conversation without changing the main runtime or messages", async () => {
    const fixture = await mount();
    const messages: ThreadMessage[] = [{
      id: "live-message", role: "user", content: [{ type: "text", text: "Keep current conversation" }],
      attachments: [], createdAt: new Date(0), metadata: { custom: {} },
    }];
    await act(async () => fixture.runtime.thread.reset(messages));
    const before = fixture.runtime.thread.getState().messages;
    const thread = fixture.runtime.thread;
    const agentCount = fixture.agentFactory.mock.calls.length;
    const subscriptionCount = fixture.subscribe.mock.calls.length;
    const unsubscriptionCount = fixture.unsubscribe.mock.calls.length;
    await deleteFromNativeMenu(fixture.container);
    await settleUntil(() => !fixture.container.textContent?.includes("历史：基础会话"));
    expect(fixture.remove).toHaveBeenCalledExactlyOnceWith("mock-history-basic");
    expect(fixture.runtime.threads.getState().mainThreadId).toBe(fixture.liveId);
    expect(fixture.binding.getThreadId()).toBe(fixture.liveId);
    expect(fixture.runtime.thread).toBe(thread);
    expect(fixture.runtime.thread.getState().messages).toEqual(before);
    expect(fixture.abortRun).not.toHaveBeenCalled();
    expect(fixture.agentFactory).toHaveBeenCalledTimes(agentCount);
    expect(fixture.subscribe).toHaveBeenCalledTimes(subscriptionCount);
    expect(fixture.unsubscribe).toHaveBeenCalledTimes(unsubscriptionCount);
    await act(async () => { await fixture.service.refresh(); await fixture.runtime.threads.reload(); });
    expect(fixture.container.textContent).not.toContain("历史：基础会话");
    expect((await fetch(`${endpoint}/conversations/mock-history-basic`)).status).toBe(404);
  });

  it("deletes the current history and synchronizes binding with upstream navigation", async () => {
    const fixture = await mount();
    await act(async () => { await fixture.runtime.threads.switchToThread("mock-history-basic"); });
    await settleUntil(() => fixture.binding.getThreadId() === "mock-history-basic");
    await deleteFromNativeMenu(fixture.container);
    await settleUntil(() =>
      !fixture.container.textContent?.includes("历史：基础会话") &&
      fixture.runtime.threads.getState().mainThreadId !== "mock-history-basic" &&
      fixture.binding.getThreadId() !== "mock-history-basic",
    );
    expect(fixture.remove).toHaveBeenCalledExactlyOnceWith("mock-history-basic");
    expect(fixture.service.getSnapshot().activeConversationId).not.toBe("mock-history-basic");
    const mainItem = fixture.runtime.threads.mainItem.getState();
    expect(mainItem.id).toBe(fixture.runtime.threads.getState().mainThreadId);
    // New threads have a local upstream id and a separately reserved backend id.
    if (mainItem.remoteId !== undefined) {
      expect(fixture.binding.getThreadId()).toBe(mainItem.remoteId);
    } else {
      expect(fixture.agentFactory.mock.calls.some(([input]) => input.threadId === fixture.binding.getThreadId())).toBe(true);
    }
  });
});
