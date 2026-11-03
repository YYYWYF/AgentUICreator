// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AssistantRuntimeProvider, useExternalStoreRuntime, useRemoteThreadListRuntime, type RemoteThreadListAdapter, type ThreadMessage } from "@assistant-ui/react";
import { expect, it } from "vitest";
import { ConversationCanonicalComposer } from "../src/public.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps a textarea unavailable while the selected thread has no editable composer", async () => {
  let complete!: (value: Awaited<ReturnType<RemoteThreadListAdapter["fetch"]>>) => void;
  const pending = new Promise<Awaited<ReturnType<RemoteThreadListAdapter["fetch"]>>>(resolve => { complete = resolve; });
  const adapter: RemoteThreadListAdapter = {
    list: async () => ({ threads: [{ remoteId: "saved", status: "regular" }] }), fetch: () => pending,
    initialize: async () => ({ remoteId: "new" }), rename: async () => {}, archive: async () => {}, unarchive: async () => {}, delete: async () => {},
    generateTitle: async () => new ReadableStream({ start(controller) { controller.close(); } }),
  };
  function Host() {
    const runtime = useRemoteThreadListRuntime({ adapter, initialThreadId: "saved", runtimeHook: () => useExternalStoreRuntime<ThreadMessage>({ messages: [], isRunning: false, onNew: async () => {} }) });
    return <AssistantRuntimeProvider runtime={runtime}><ConversationCanonicalComposer autoFocus={false} /></AssistantRuntimeProvider>;
  }
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<Host />));
    expect(container.querySelector<HTMLTextAreaElement>("textarea")!.disabled).toBe(true);
    await act(async () => complete({ remoteId: "saved", status: "regular" }));
    for (let attempt = 0; attempt < 100 && container.querySelector<HTMLTextAreaElement>("textarea")?.disabled; attempt++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    expect(container.querySelector<HTMLTextAreaElement>("textarea")!.disabled).toBe(false);
  } finally { complete({ remoteId: "saved", status: "regular" }); await act(async () => root.unmount()); container.remove(); }
});
