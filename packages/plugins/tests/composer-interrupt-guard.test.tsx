// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { HttpAgent } from "@ag-ui/client";
import { useAui, type AssistantRuntime, type AttachmentAdapter } from "@assistant-ui/react";
import { AgentUIRoot, AgentUILocaleProvider, ConversationThread, ConversationTransientMessages, ConversationCanonicalComposer, ConversationComposerSend, ConversationComposerQuotePreview, useConversationComposer } from "@za38.03/agent-ui-plugins";
import { ConversationComposerLexicalInput } from "@za38.03/agent-ui-plugins/lexical";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConversationRuntimeProvider } from "../../runtime/src/ConversationRuntimeProvider.js";
import { useConversationRuntimeBridge, type ConversationRuntimeBridge } from "../../runtime/src/ConversationRuntimeBridgeContext.js";
import { createEphemeralConversationThreadBinding } from "../../runtime/src/threads/ephemeral-thread-binding.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// JSDOM omits Range layout; Lexical restores the caret when a Composer remounts.
const rangeRect = Object.getOwnPropertyDescriptor(Range.prototype, "getBoundingClientRect");
beforeAll(() => Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() }));
afterAll(() => {
  if (rangeRect) Object.defineProperty(Range.prototype, "getBoundingClientRect", rangeRect);
  else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
});
const adapter: AttachmentAdapter = {
  accept: "text/plain",
  async add({ file }) { return { id: "draft-file", type: "file", name: file.name, contentType: file.type, file, status: { type: "requires-action", reason: "composer-send" } }; },
  async remove() {},
  async send(attachment) { return { ...attachment, status: { type: "complete" }, content: [{ type: "text", text: "attached content" }] }; },
};
async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  }
  throw new Error("Composer guard did not settle");
}

describe("product Composer pending interrupt policy", () => {
  it.each([false, true])("preserves the draft without requests and restores sending (Lexical: %s)", async lexical => {
    const inputs: { resume?: unknown[] }[] = [];
    const agent = new HttpAgent({ url: "http://example.test/agent", fetch: async (_url, init) => {
      const input = JSON.parse(String(init.body));
      inputs.push(input);
      const events = [
        { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
        { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId,
          ...((inputs.length === 1 || inputs.length === 3) ? { outcome: { type: "interrupt", interrupts: [{ id: "pending-1", reason: "langgraph.interrupt", metadata: { langgraph: { raw: { action_requests: [{ name: "confirm", args: {} }] } } } }] } } : {}) },
      ];
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
    } });
    let native!: AssistantRuntime;
    let bridge!: ConversationRuntimeBridge;
    let composer!: ReturnType<typeof useConversationComposer>;
    let slotEnterCount = 0;
    let slotClickCount = 0;
    function Capture() {
      native = useAui().threads.__internal_getAssistantRuntime!();
      bridge = useConversationRuntimeBridge();
      composer = useConversationComposer();
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const binding = createEphemeralConversationThreadBinding();
    const factory = () => agent;
    let composerMount = 0;
    const render = () => <AgentUILocaleProvider locale="zh-CN"><AgentUIRoot theme="violet">
        <ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding}
          attachmentAdapter={adapter} unstable_agentFactory={factory}>
          <Capture />
          <ConversationThread autoFocus={false} components={{ TransientMessages: ConversationTransientMessages }} composer={<ConversationCanonicalComposer key={composerMount} autoFocus={false} input={lexical ? <ConversationComposerLexicalInput /> : undefined}
            beforeInput={<><ConversationComposerQuotePreview dismissLabel="Dismiss quote" />
              <input data-testid="slot-input" onKeyDown={event => {
                if (event.key === "Enter" && !event.defaultPrevented) slotEnterCount++;
              }} />
              <button type="button" data-testid="slot-action" onClick={() => slotClickCount++}>Slot action</button>
            </>}
            submitAction={<ConversationComposerSend />} />} />
        </ConversationRuntimeProvider>
      </AgentUIRoot></AgentUILocaleProvider>;
    try {
      await act(async () => root.render(render()));
      await until(() => native !== undefined && !native.thread.getState().isLoading);
      let sent!: Promise<void>;
      await act(async () => { sent = bridge.agentRuntime.sendMessage("Start"); });
      await until(() => bridge.agentRuntime.getSnapshot().interrupts.length === 1);
      await sent;
      expect(container.querySelector('[data-slot="composer-awaiting-reply"]')).toBeNull();
      expect(container.querySelectorAll('[data-slot="transient-message"]')).toHaveLength(0);
      await act(async () => {
        native.thread.composer.setText("保留这条新消息");
        native.thread.composer.setQuote({ text: "保留引用", messageId: "quoted" });
        await native.thread.composer.addAttachment(new File(["draft"], "draft.txt", { type: "text/plain" }));
      });
      await until(() => native.thread.composer.getState().attachments.length === 1);
      const draft = native.thread.composer.getState();
      const send = container.querySelector<HTMLButtonElement>(".aui-composer-send")!;
      const input = container.querySelector<HTMLElement>(lexical ? '[data-slot="aui_composer-input"] [contenteditable="true"]' : '[data-slot="aui_composer-input"] textarea')!;
      expect(send.disabled).toBe(false);
      expect(composer.canSend).toBe(true);
      expect(container.querySelector('[data-slot="composer-quote"]')?.textContent).toContain("保留引用");
      await act(async () => {
        container.querySelector('[data-testid="slot-input"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        container.querySelector<HTMLButtonElement>('[data-testid="slot-action"]')!.click();
      });
      expect(slotEnterCount).toBe(1);
      expect(slotClickCount).toBe(1);
      await act(async () => send.click());
      const reminders = () => container.querySelectorAll('[data-slot="transient-message"][data-transient-message-role="system"]');
      expect(reminders()).toHaveLength(1);
      expect(reminders()[0]?.classList.contains("items-center")).toBe(true);
      expect(reminders()[0]?.textContent).toContain("请先回答上方的问题");
      await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
      expect(reminders()).toHaveLength(1);
      await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      expect(reminders()).toHaveLength(1);
      await act(async () => composer.send());
      expect(reminders()).toHaveLength(1);
      const reminderId = reminders()[0]?.getAttribute("data-transient-message-id");
      composerMount++;
      await act(async () => root.render(render()));
      await act(async () => composer.send());
      expect(reminders()).toHaveLength(1);
      expect(reminders()[0]?.getAttribute("data-transient-message-id")).toBe(reminderId);
      expect(inputs).toHaveLength(1);
      expect(native.thread.composer.getState().text).toBe(draft.text);
      expect(native.thread.composer.getState().attachments).toEqual(draft.attachments);
      expect(native.thread.composer.getState().quote).toEqual(draft.quote);
      let resumed!: Promise<void>;
      await act(async () => { resumed = bridge.agentRuntime.resumeInterrupts([{ interruptId: "pending-1", status: "resolved", payload: { confirmed: true } }]); });
      await until(() => container.querySelector('[data-slot="composer-awaiting-reply"]') === null && container.querySelector<HTMLButtonElement>(".aui-composer-send")?.disabled === false);
      await resumed;
      expect(native.thread.composer.getState().text).toBe(draft.text);
      expect(composer.canSend).toBe(true);
      expect(inputs[1]!.resume).toEqual([{ interruptId: "pending-1", status: "resolved", payload: { confirmed: true } }]);
      expect(reminders()).toHaveLength(1);
      expect(JSON.stringify(inputs)).not.toContain("请先回答上方的问题");
      await act(async () => container.querySelector<HTMLButtonElement>(".aui-composer-send")!.click());
      await until(() => inputs.length === 3 && !native.thread.getState().isRunning);
      expect(native.thread.composer.getState().text).toBe("");
      // A subsequent interrupt may reuse the same backend ID, but is a new waiting period.
      await until(() => bridge.agentRuntime.getSnapshot().interrupts.length === 1);
      await act(async () => native.thread.composer.setText("下一次等待时的草稿"));
      await act(async () => composer.send());
      await act(async () => composer.send());
      expect(reminders()).toHaveLength(2);
      expect(reminders()[1]?.getAttribute("data-transient-message-id")).not.toBe(reminderId);
      expect(inputs).toHaveLength(3);
      expect(native.thread.composer.getState().text).toBe("下一次等待时的草稿");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
