// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ComposerPrimitive, useAui, useAuiState, type AssistantRuntime } from "@assistant-ui/react";
import type { RunAgentInput } from "@ag-ui/client";
import { expect, it, vi } from "vitest";
import { ConversationRuntimeProvider, type ConversationRuntimeProviderProps, type ConversationThreadBinding } from "../src/public.js";

async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  expect(predicate()).toBe(true);
}

it.each([false, true])("reports failed initial history without overriding the thread disabled flag (%s)", async disabled => {
  let runtime!: AssistantRuntime;
  let rejectHistory!: (error: Error) => void;
  const history = new Promise<never>((_resolve, reject) => { rejectHistory = reject; });
  const loadThread = vi.fn(() => history);
  const onError = vi.fn();
  const requests: RunAgentInput[] = [];
  const binding: ConversationThreadBinding = {
    getThreadId: () => "missing-thread",
    subscribe: () => () => {},
    createNewThread: async () => "new-thread",
    getThreadIsDisabled: () => disabled,
    loadThread,
  };
  const fetch: NonNullable<ConversationRuntimeProviderProps["fetch"]> = async (_url, init) => {
    const input = JSON.parse(String(init.body)) as RunAgentInput;
    requests.push(input);
    const frames = [
      { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
      { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId },
    ];
    return new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(""), {
      headers: { "Content-Type": "text/event-stream" },
    });
  };
  function Input() {
    runtime = useAui().threads.__internal_getAssistantRuntime!();
    const loading = useAuiState(state => state.thread.isLoading);
    return <ComposerPrimitive.Root><ComposerPrimitive.Input disabled={loading} /></ComposerPrimitive.Root>;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await act(async () => root.render(
      <ConversationRuntimeProvider endpoint="https://example.test/agent" threadBinding={binding} onError={onError} fetch={fetch}>
        <Input />
      </ConversationRuntimeProvider>,
    ));
    await until(() => loadThread.mock.calls.length === 1);
    expect(container.querySelector("textarea")!.disabled).toBe(true);
    const failure = new Error('Conversation "missing-thread" was not found.');
    await act(async () => rejectHistory(failure));
    await until(() => onError.mock.calls.length === 1 && !runtime.thread.getState().isLoading);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(container.querySelector("textarea")!.disabled).toBe(disabled);
    expect(requests).toEqual([]);
    if (!disabled) {
      await act(async () => runtime.thread.composer.setText("Continue"));
      expect(container.querySelector("textarea")!.value).toBe("Continue");
      await act(async () => runtime.thread.composer.send());
      await until(() => requests.length === 1 && !runtime.thread.getState().isRunning);
      expect(requests[0]!.threadId).toBe("missing-thread");
      expect(requests[0]!.messages).toMatchObject([{ role: "user", content: "Continue" }]);
    }
  } finally {
    await act(async () => root.unmount());
    container.remove();
    log.mockRestore();
  }
});
