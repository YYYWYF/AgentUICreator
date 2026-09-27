// @vitest-environment jsdom
import { useAui, ComposerPrimitive, type AssistantRuntime } from "@assistant-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationRuntimeProvider, createEphemeralConversationThreadBinding } from "@agent-ui/runtime-conversation";
import { ConversationThread, ConversationCanonicalComposer, ConversationComposerAddAttachment } from "../../src/index.js";
import { DemoAttachmentAdapter } from "../../../mock-agent/src/demo-attachment-adapter.js";
import { CancellationAwareHttpAgent } from "../../../runtime-conversation/src/compatibility/cancellation-aware-http-agent.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let runtime: AssistantRuntime;
let container: HTMLDivElement;
let receivedRequests = 0;

async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for canonical attachment UI");
}
function Capture() { runtime = useAui().threads.__internal_getAssistantRuntime!(); return null; }
function findButton(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(element =>
    (element.getAttribute("aria-label") ?? element.textContent ?? "").trim() === label,
  );
}
function button(label: string): HTMLButtonElement {
  const element = findButton(label);
  if (element === undefined) throw new Error(`Missing ${label} button`);
  return element;
}
function imageFile() { return new File(["small-image"], "demo.png", { type: "image/png" }); }

beforeEach(async () => {
  receivedRequests = 0;
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  if (globalThis.PointerEvent === undefined) vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL() { return "blob:demo-image"; }
    static revokeObjectURL() {}
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: () => {} });
  const agent = new CancellationAwareHttpAgent({ url: "http://example.test/agent", fetch: async (_url, init) => {
    receivedRequests += 1;
    const input = JSON.parse(String(init.body)) as { threadId: string; runId: string };
    return new Response([
      { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
      { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  const binding = createEphemeralConversationThreadBinding();
  await act(async () => {
    root!.render(<ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding}
      attachmentAdapter={new DemoAttachmentAdapter()} unstable_agentFactory={() => agent}>
      <Capture /><ConversationThread autoFocus={false} composer={<ConversationCanonicalComposer autoFocus={false}
        leadingActions={<ConversationComposerAddAttachment />} submitAction={<ComposerPrimitive.Send aria-label="Send" />} />} />
    </ConversationRuntimeProvider>);
  });
  await act(async () => until(() => runtime.thread.getState().isLoading === false));
});

afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined;
  document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("canonical assistant-ui attachment UI", () => {
  it("selects files through upstream AddAttachment, previews, deletes and displays sent user attachments", async () => {
    expect(button("Add Attachment").disabled).toBe(false);
    const nativeClick = HTMLInputElement.prototype.click;
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      if (this.type !== "file") return nativeClick.call(this);
      expect(this.accept).toBe("image/*,application/pdf");
      expect(this.multiple).toBe(true);
      Object.defineProperty(this, "files", { configurable: true, value: [imageFile()] });
      this.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { button("Add Attachment").click(); await until(() => runtime.thread.composer.getState().attachments.length === 1); });
    expect(container.querySelector('[role="button"][aria-label="Image attachment"]')).not.toBeNull();
    await act(async () => { button("Remove file").click(); await until(() => runtime.thread.composer.getState().attachments.length === 0); });
    expect(container.querySelector('[role="button"][aria-label="Image attachment"]')).toBeNull();
    await act(async () => { button("Add Attachment").click(); await until(() => runtime.thread.composer.getState().attachments.length === 1); });
    await act(async () => {
      runtime.thread.composer.setText("Describe this image");
    });
    await act(async () => {
      button("Send").click();
    });
    await act(async () => {
      await until(() => receivedRequests === 1 && !runtime.thread.getState().isRunning);
    });
    expect(runtime.thread.composer.getState().attachments).toHaveLength(0);
    expect(container.textContent).toContain("Describe this image");
    expect(container.querySelector('[role="button"][aria-label="Image attachment"]')).not.toBeNull();
    expect(findButton("Remove file")).toBeUndefined();
  });

  it.each(["drop", "paste"])("keeps upstream %s ingestion", async kind => {
    const input = container.querySelector("textarea")!;
    const event = new Event(kind, { bubbles: true, cancelable: true });
    const transfer = { files: [imageFile()], types: ["Files"], dropEffect: "copy" };
    Object.defineProperty(event, kind === "drop" ? "dataTransfer" : "clipboardData", { value: transfer });
    await act(async () => {
      input.dispatchEvent(event);
      await until(() => runtime.thread.composer.getState().attachments.length === 1);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(container.querySelector('[role="button"][aria-label="Image attachment"]')).not.toBeNull();
  });
});
