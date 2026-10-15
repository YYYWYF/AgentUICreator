import { HttpAgent } from "@ag-ui/client";
import { useAui, type DictationAdapter } from "@assistant-ui/react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { ConversationRuntimeProvider, createEphemeralConversationThreadBinding } from "../src/index.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function fixture(dictationAdapter?: DictationAdapter) {
  const captured: { aui?: ReturnType<typeof useAui> } = {};
  function Capture() { captured.aui = useAui(); return null; }
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <ConversationRuntimeProvider
        endpoint="http://example.test/agent"
        threadBinding={createEphemeralConversationThreadBinding()}
        dictationAdapter={dictationAdapter}
        unstable_agentFactory={({ endpoint, threadId }) => new HttpAgent({ url: endpoint, threadId })}
      >
        <Capture />
      </ConversationRuntimeProvider>,
    );
  });
  if (captured.aui === undefined) {
    await act(async () => renderer.unmount());
    throw new Error("assistant-ui client was not captured");
  }
  const client = captured.aui;
  await act(async () => {
    for (let attempt = 0; attempt < 100 && client.thread.getState().isLoading; attempt++) {
      await new Promise<void>(resolve => setImmediate(resolve));
    }
  });
  if (client.thread.getState().isLoading) {
    await act(async () => renderer.unmount());
    throw new Error("Conversation thread did not finish loading");
  }
  return { client, dispose: async () => { await act(async () => renderer.unmount()); } };
}

describe("ConversationRuntimeProvider dictation adapter", () => {
  it("leaves dictation unavailable when no adapter is supplied", async () => {
    const f = await fixture();
    try {
      expect(f.client.thread.getState().capabilities.dictation).toBe(false);
      expect(f.client.thread.composer().getState().dictation).toBeUndefined();
    } finally { await f.dispose(); }
  });

  it("exposes the upstream capability and delegates dictation to the supplied adapter", async () => {
    let emitSpeech: ((result: DictationAdapter.Result) => void) | undefined;
    const session: DictationAdapter.Session = {
      status: { type: "running" },
      stop: vi.fn(async () => {}),
      cancel: vi.fn(),
      onSpeechStart: () => () => {},
      onSpeechEnd: () => () => {},
      onSpeech: callback => { emitSpeech = callback; return () => { emitSpeech = undefined; }; },
    };
    const listen = vi.fn(() => session);
    const f = await fixture({ listen });
    try {
      expect(f.client.thread.getState().capabilities.dictation).toBe(true);
      await act(async () => { f.client.thread.composer().startDictation(); });
      expect(listen).toHaveBeenCalledOnce();
      expect(f.client.thread.composer().getState().dictation).toBeDefined();
      await act(async () => { emitSpeech?.({ transcript: "hello", isFinal: true }); });
      expect(f.client.thread.composer().getState().text).toBe("hello");
      await act(async () => { f.client.thread.composer().stopDictation(); });
      expect(session.stop).toHaveBeenCalledOnce();
    } finally { await f.dispose(); }
  });
});
