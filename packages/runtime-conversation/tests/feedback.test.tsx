import { HttpAgent } from "@ag-ui/client";
import { useAui } from "@assistant-ui/react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ConversationRuntimeProvider, type ConversationFeedbackAdapter, type ConversationThreadBinding } from "../src/index.js";

async function fixture(feedbackAdapter?: ConversationFeedbackAdapter) {
  let aui!: ReturnType<typeof useAui>;
  function Capture() { aui = useAui(); return null; }
  const binding: ConversationThreadBinding = {
    getThreadId: () => "feedback-thread", subscribe: () => () => {}, createNewThread: async () => "new-thread",
    loadThread: async () => ({ messages: [{ id: "answer", role: "assistant", content: [{ type: "text", text: "answer" }], createdAt: new Date(0), status: { type: "complete", reason: "stop" }, metadata: { custom: {}, steps: [], unstable_state: null, unstable_annotations: [], unstable_data: [] } }] }),
  };
  const onError = vi.fn();
  const fetch = vi.fn();
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding} feedbackAdapter={feedbackAdapter} onError={onError} unstable_agentFactory={({ endpoint, threadId }) => new HttpAgent({ url: endpoint, threadId, fetch })}><Capture /></ConversationRuntimeProvider>); });
  await act(async () => { for (let i = 0; i < 100 && aui.thread.getState().isLoading; i++) await new Promise<void>(r => setImmediate(r)); });
  return { aui, fetch, onError, dispose: async () => { await act(async () => renderer.unmount()); } };
}
describe("Host feedback adapter", () => {
  it("requires a real adapter", async () => {
    const f = await fixture();
    try { expect(f.aui.thread.getState().capabilities.feedback).toBe(false); } finally { await f.dispose(); }
  });
  it("persists native optimistic feedback with owned identity and never starts an AG-UI run", async () => {
    const submit = vi.fn(); const f = await fixture({ submit });
    try {
      expect(f.aui.thread.getState().capabilities.feedback).toBe(true);
      for (const type of ["positive", "negative"] as const) {
        await act(async () => f.aui.thread.message({ id: "answer" }).submitFeedback({ type }));
        expect(submit).toHaveBeenLastCalledWith({ threadId: "feedback-thread", messageId: "answer", type });
        expect(f.aui.thread.message({ id: "answer" }).getState().metadata.submittedFeedback).toEqual({ type });
      }
      expect(f.fetch).not.toHaveBeenCalled();
    } finally { await f.dispose(); }
  });
  it("forwards the optional comment through the native message runtime", async () => {
    const submit = vi.fn(); const f = await fixture({ submit });
    try {
      await act(async () => f.aui.threads.__internal_getAssistantRuntime!().thread.getMessageById("answer").submitFeedback({ type: "negative", comment: "Missing sources" }));
      expect(submit).toHaveBeenCalledWith({ threadId: "feedback-thread", messageId: "answer", type: "negative", comment: "Missing sources" });
    } finally { await f.dispose(); }
  });
  it.each([false, true])("reports persistence failure (async=%s) without a run or rollback", async (asyncFailure) => {
    const error = new Error("persistence failed");
    const f = await fixture({ submit: () => { if (asyncFailure) return Promise.reject(error); throw error; } });
    try {
      await act(async () => f.aui.thread.message({ id: "answer" }).submitFeedback({ type: "negative" }));
      expect(f.onError).toHaveBeenCalledWith(error);
      expect(f.aui.thread.message({ id: "answer" }).getState().metadata.submittedFeedback).toEqual({ type: "negative" });
      expect(f.fetch).not.toHaveBeenCalled();
    } finally { await f.dispose(); }
  });
});
