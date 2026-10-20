// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HttpAgent } from "@ag-ui/client";
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { expect, it } from "vitest";
import { AgentUIRoot, AgentUILocaleProvider, ConversationThread, createConversationTransientMessageService, useConversationNavigation, useConversationComposer, useConversationTransientMessages, type ConversationNavigation } from "../src/index.js";
import { resolveTransientMessageAnchor } from "../src/conversation-transient-message-service.js";
import { ConversationRuntimeProvider } from "../../runtime/src/ConversationRuntimeProvider.js";
import { useConversationRuntimeBridge, type ConversationRuntimeBridge } from "../../runtime/src/ConversationRuntimeBridgeContext.js";
import type { ConversationThreadBinding, ConversationMessage } from "../../runtime/src/threads/types.js";
import { PluginRenderScopeProvider } from "../resources/registry/items/foundation/core-runtime/files/runtime/plugins/PluginRenderScope";
import { TransientAssistantMessagesPlugin } from "../resources/registry/items/plugin/transient-assistant-messages/files/plugins/transient-assistant-messages/index";

function SourceDisplay(value: { afterMessageId: string | null }) {
  return <PluginRenderScopeProvider scope={{ kind: "conversation.transient-messages", value }}><TransientAssistantMessagesPlugin /></PluginRenderScopeProvider>;
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  }
  throw new Error("Transient message fixture did not settle");
}

it("keeps independent immutable snapshots and survives optimistic ID replacement", () => {
  const service = createConversationTransientMessageService();
  expect(() => service.addMessage({ role: "assistant", text: "not mounted" })).toThrow("mounted");
  let current = { conversationId: "A", messageIds: ["user", "optimistic"] };
  const detach = service.bindTarget(() => current);
  expect(() => service.addMessage({ role: "invalid", text: "invalid" } as never)).toThrow("role");
  expect(() => service.addMessage({ role: "assistant", type: "invalid", text: "invalid" } as never)).toThrow("type");
  expect(() => service.addMessage({ role: "user", text: " " })).toThrow("non-empty");
  const empty = service.getSnapshot("A");
  service.addMessage({ role: "user", text: "first" });
  const first = service.getSnapshot("A");
  service.addMessage({ role: "assistant", text: "second" });
  expect(empty).toHaveLength(0);
  expect(first).toHaveLength(1);
  expect(service.getSnapshot("A").map(message => message.text)).toEqual(["first", "second"]);
  expect(service.getSnapshot("A").map(message => message.role)).toEqual(["user", "assistant"]);
  expect(service.getSnapshot("A").map(message => message.type)).toEqual(["normal", "normal"]);
  expect(resolveTransientMessageAnchor(first[0]!, ["user", "settled", "next-user"])).toBe("settled");
  current = { conversationId: "B", messageIds: [] };
  service.addMessage({ role: "assistant", text: "only B" });
  expect(service.getSnapshot("B")).toHaveLength(1);
  expect(resolveTransientMessageAnchor(service.getSnapshot("B")[0]!, [])).toBeNull();
  detach();
  expect(service.getSnapshot("A")).toHaveLength(2);
  expect(createConversationTransientMessageService().getSnapshot("A")).toHaveLength(0);
});

it("retains notices across A/B navigation without changing real messages, interrupt, history or request context", async () => {
  const container = document.createElement("div"); document.body.append(container);
  const requests: { resume?: unknown[]; messages: unknown[] }[] = [];
  const histories = new Map<string, readonly ConversationMessage[]>();
  for (const id of ["A", "B"]) histories.set(id, [
    { id: `${id}-user`, role: "user", content: [{ type: "text", text: `request ${id}` }], createdAt: new Date(0), attachments: [], metadata: { custom: {} } },
    { id: `${id}-assistant`, role: "assistant", content: [{ type: "text", text: `answer ${id}` }], createdAt: new Date(0), status: { type: "complete" }, metadata: { custom: {} } },
  ]);
  let activeId = "A";
  const binding: ConversationThreadBinding = {
    getThreadId: () => activeId, activateThread: id => { activeId = id; }, subscribe: () => () => {},
    createNewThread: async () => crypto.randomUUID(),
    loadThread: async id => ({ messages: histories.get(id) ?? [] }),
    getThreadListSnapshot: () => ({ threads: [{ id: "A", status: "regular" }, { id: "B", status: "regular" }], archivedThreads: [] }),
  };
  const factory = () => new HttpAgent({ url: "http://example.test/agent", fetch: async (_url, init) => {
    const input = JSON.parse(String(init.body)); requests.push(input);
    const events = [{ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
      { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId,
        ...(!input.resume ? { outcome: { type: "interrupt", interrupts: [{ id: "approval-A", reason: "confirmation", message: "Continue?" }] } } : {}) }];
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  } });
  let native!: AssistantRuntime;
  let bridge!: ConversationRuntimeBridge;
  let navigation!: ConversationNavigation;
  let notice!: ReturnType<typeof useConversationTransientMessages>;
  let composer!: ReturnType<typeof useConversationComposer>;
  function Capture() {
    native = useAui().threads.__internal_getAssistantRuntime!();
    bridge = useConversationRuntimeBridge(); navigation = useConversationNavigation(); notice = useConversationTransientMessages(); composer = useConversationComposer();
    return null;
  }
  let root: Root = createRoot(container);
  const service = createConversationTransientMessageService();
  const render = (messages = service) => <AgentUILocaleProvider locale="zh-CN"><AgentUIRoot theme="violet">
    <ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding} transientMessages={messages} unstable_agentFactory={factory}>
      <Capture /><ConversationThread autoFocus={false} components={{ TransientMessages: SourceDisplay }} />
    </ConversationRuntimeProvider>
  </AgentUIRoot></AgentUILocaleProvider>;
  try {
    await act(async () => root.render(render()));
    await until(() => !!native && !native.thread.getState().isLoading);
    const original = native.thread.getState().messages;
    await act(async () => { notice.addMessage({ role: "user", text: "LOCAL_A_FIRST" }); notice.addMessage({ role: "assistant", text: "LOCAL_A_SECOND" }); });
    expect(requests).toHaveLength(0);
    expect(native.thread.getState().messages).toEqual(original);
    expect(container.querySelectorAll('[data-slot="transient-message"]')).toHaveLength(2);
    expect(container.querySelector('[data-transient-message-role="user"]')?.textContent).toBe("LOCAL_A_FIRST");
    expect(container.querySelector('[data-transient-message-role="assistant"]')?.textContent).toBe("LOCAL_A_SECOND");
    expect(container.querySelector('[data-slot="transient-message"] [data-message-id]')).toBeNull();
    await act(async () => { await navigation.switchToThread("B"); });
    await until(() => bridge.agentRuntime.getSnapshot().conversation.id === "B" && !native.thread.getState().isLoading);
    expect(container.textContent).not.toContain("LOCAL_A_FIRST");
    await act(async () => { service.addMessage({ role: "assistant", text: "LOCAL_B_ONLY" }); });
    await act(async () => { await navigation.switchToThread("A"); });
    await until(() => bridge.agentRuntime.getSnapshot().conversation.id === "A" && !native.thread.getState().isLoading);
    expect(container.textContent).toContain("LOCAL_A_FIRST");
    expect(container.textContent).not.toContain("LOCAL_B_ONLY");
    let sent!: Promise<void>;
    await act(async () => { sent = bridge.agentRuntime.sendMessage("Ask Agent"); });
    await until(() => bridge.agentRuntime.getSnapshot().interrupts.length === 1); await sent;
    const pending = bridge.agentRuntime.getSnapshot().interrupts;
    const real = native.thread.getState().messages;
    await act(async () => {
      notice.addMessage({ role: "user", text: "LOCAL_INTERRUPT_USER" });
      notice.addMessage({ role: "assistant", type: "error", text: "LOCAL_INTERRUPT_NOTICE" });
      notice.addMessage({ role: "system", text: "LOCAL_SYSTEM_NOTICE" });
    });
    expect(container.querySelector('[data-transient-message-role="system"]')?.getAttribute("aria-label")).toBe("系统消息");
    expect(container.querySelector('[data-transient-message-role="system"]')?.classList.contains("items-center")).toBe(true);
    expect(requests).toHaveLength(1);
    expect(native.thread.getState().messages).toEqual(real);
    expect(bridge.agentRuntime.getSnapshot().interrupts).toEqual(pending);
    expect(bridge.agentRuntime.getSnapshot().run.status).toBe("awaiting-input");
    expect(container.querySelector('[data-transient-message-type="error"]')?.getAttribute("role")).toBe("alert");
    await act(async () => native.thread.composer.setText("KEEP_DRAFT"));
    await act(async () => composer.send());
    const reminderIds = () => Array.from(container.querySelectorAll('[data-transient-message-role="system"]'))
      .map(element => element.getAttribute("data-transient-message-id"));
    const beforeSwitch = reminderIds();
    expect(beforeSwitch).toHaveLength(2);
    await act(async () => { await navigation.switchToThread("B"); });
    await until(() => bridge.agentRuntime.getSnapshot().conversation.id === "B" && !native.thread.getState().isLoading);
    await act(async () => { await navigation.switchToThread("A"); });
    await until(() => bridge.agentRuntime.getSnapshot().conversation.id === "A" && !native.thread.getState().isLoading);
    await act(async () => native.thread.composer.setText("KEEP_DRAFT"));
    await act(async () => composer.send());
    expect(reminderIds()).toEqual(beforeSwitch);
    expect(requests).toHaveLength(1);
    await expect(bridge.agentRuntime.sendMessage("Cannot bypass")).rejects.toThrow("pending interrupts");
    // The earlier notices stay before the next real user message, rather than following the tail.
    const text = container.textContent!;
    expect(text.indexOf("LOCAL_A_FIRST")).toBeLessThan(text.indexOf("Ask Agent"));
    let resumed!: Promise<void>;
    await act(async () => { resumed = bridge.agentRuntime.resumeInterrupts([{ interruptId: "approval-A", status: "resolved", payload: true }]); });
    await until(() => bridge.agentRuntime.getSnapshot().interrupts.length === 0); await resumed;
    expect(requests[1]!.resume).toEqual([{ interruptId: "approval-A", status: "resolved", payload: true }]);
    expect(JSON.stringify(requests)).not.toContain("LOCAL_");
    const exported = native.thread.export();
    expect(JSON.stringify(exported)).not.toContain("LOCAL_");
    histories.set("A", exported.messages.map(entry => entry.message as unknown as ConversationMessage));
    await act(async () => root.unmount());
    root = createRoot(container);
    // Remount with the Host-owned page service retains notices even if the UI unmounts.
    await act(async () => root.render(render()));
    await until(() => !native.thread.getState().isLoading);
    expect(container.textContent).toContain("LOCAL_INTERRUPT_NOTICE");
    expect(container.textContent).toContain("LOCAL_INTERRUPT_USER");
    expect(container.textContent).toContain("LOCAL_SYSTEM_NOTICE");
    await act(async () => root.unmount()); root = createRoot(container);
    // A page reload creates a fresh service and loads only real persisted messages.
    await act(async () => root.render(render(createConversationTransientMessageService())));
    await until(() => !native.thread.getState().isLoading);
    expect(container.querySelectorAll('[data-slot="transient-message"]')).toHaveLength(0);
    expect(container.textContent).toContain("Ask Agent");
    expect(requests).toHaveLength(2);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
