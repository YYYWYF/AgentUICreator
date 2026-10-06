// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime, type AssistantRuntime } from "@assistant-ui/react";
import { describe, expect, it } from "vitest";
import { ConversationCanonicalComposer, ConversationComposerSend, ConversationComposerCancel } from "../src/public.js";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
async function fixture(queue: boolean) {
  let runtime!: AssistantRuntime;
  function App() {
    runtime = useLocalRuntime({ async *run({ abortSignal }) { await new Promise<void>(resolve => abortSignal.addEventListener("abort", () => resolve(), { once: true })); } }, { unstable_enableMessageQueue: queue });
    return <AssistantRuntimeProvider runtime={runtime}>
      <ConversationCanonicalComposer queueLabels={{ queued: "待发送", removeQueued: "移除待发送消息" }} submitAction={<><ConversationComposerSend label="发送" queueLabel="加入待发送" /><ConversationComposerCancel label="停止生成" /></>} />
    </AssistantRuntimeProvider>;
  }
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  await act(async () => root.render(<App />));
  const send = async (text: string) => { await act(async () => { runtime.thread.composer.setText(text); runtime.thread.composer.send(); }); };
  return { container, get runtime() { return runtime; }, send, dispose: async () => { await act(async () => { runtime.thread.cancelRun(); root.unmount(); }); container.remove(); } };
}
describe("canonical Composer queue presentation", () => {
  it.each([false, true])("shows correct running Send/Stop actions (queue=%s)", async queue => {
    const f = await fixture(queue);
    try {
      expect(f.container.querySelector('[aria-label="发送"]')).not.toBeNull();
      expect(f.container.querySelector('[aria-label="停止生成"]')).toBeNull();
      await f.send("active");
      expect(f.container.querySelector('[aria-label="停止生成"]')).not.toBeNull();
      expect(f.container.querySelector('[aria-label="加入待发送"]') !== null).toBe(queue);
      expect(f.container.querySelector('[aria-label="发送"]')).toBeNull();
    } finally { await f.dispose(); }
  });
  it("queues Enter, ignores IME Enter, and removes a native pending item", async () => {
    const f = await fixture(true);
    try {
      await f.send("active");
      await act(async () => f.runtime.thread.composer.setText("follow-up"));
      const input = f.container.querySelector("textarea")!;
      await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, isComposing: true, bubbles: true, cancelable: true })));
      expect(f.runtime.thread.composer.getState().queue).toHaveLength(0);
      await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
      expect(f.runtime.thread.composer.getState().queue.map(x => x.prompt)).toEqual(["follow-up"]);
      expect(f.container.querySelector('[data-slot="aui_composer-queue"]')?.textContent).toContain("待发送");
      expect(f.container.querySelector('[data-slot="aui_composer-queue-item"]')?.textContent).toContain("follow-up");
      await act(async () => f.container.querySelector<HTMLButtonElement>('[aria-label="移除待发送消息"]')!.click());
      expect(f.runtime.thread.composer.getState().queue).toHaveLength(0);
      expect(f.container.querySelector('[data-slot="aui_composer-queue"]')).toBeNull();
    } finally { await f.dispose(); }
  });
});
