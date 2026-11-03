// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AssistantRuntimeProvider, useExternalStoreRuntime, type AssistantRuntime, type ThreadMessage } from "@assistant-ui/react";
import { expect, it } from "vitest";
import { ConversationComposerSend } from "../src/plugins/submit-action/adapters/presentation/submit-action.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("does not let a child disabled=false override the canonical empty-composer guard", async () => {
  let runtime!: AssistantRuntime;
  function Host({ disabled }: { disabled?: boolean | undefined }) { runtime = useExternalStoreRuntime<ThreadMessage>({ messages: [], isRunning: false, onNew: async () => {} }); return <AssistantRuntimeProvider runtime={runtime}><ConversationComposerSend disabled={disabled} /></AssistantRuntimeProvider>; }
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<Host />)); expect(host.querySelector("button")!.disabled).toBe(true);
    await act(async () => root.render(<Host disabled={false} />)); expect(host.querySelector("button")!.disabled).toBe(true);
    await act(async () => runtime.thread.composer.setText("Message")); expect(host.querySelector("button")!.disabled).toBe(false);
    await act(async () => root.render(<Host disabled />)); expect(host.querySelector("button")!.disabled).toBe(true);
    await act(async () => root.render(<Host disabled={false} />)); expect(host.querySelector("button")!.disabled).toBe(false);
    await act(async () => runtime.thread.composer.setText("  \n  ")); expect(host.querySelector("button")!.disabled).toBe(true);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
