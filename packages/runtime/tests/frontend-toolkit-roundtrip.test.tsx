import { StrictMode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MessagePrimitive, ThreadPrimitive, useAui, type AssistantRuntime } from "@assistant-ui/react";
import { HttpAgent, type RunAgentInput } from "@ag-ui/client";
import { expect, it, vi } from "vitest";
import { ConversationRuntimeProvider } from "../src/ConversationRuntimeProvider.js";
import { useConversationRuntimeBridge } from "../src/ConversationRuntimeBridgeContext.js";
import type { ConversationToolCallProps, ConversationToolkit } from "../src/plugin-api/index.js";
import { createEphemeralConversationThreadBinding } from "../src/threads/ephemeral-thread-binding.js";
import type { ConversationLoadedThread } from "../src/threads/types.js";

async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (predicate()) return;
    await act(async () => { await new Promise<void>(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error("TOOLKIT_ROUNDTRIP_DID_NOT_SETTLE");
}

it.each(["complete", "disabled", "cancel"] as const)("handles a native toolkit roundtrip (%s)", async mode => {
  const disabled = mode === "disabled";
  let native!: AssistantRuntime;
  let bridge!: ReturnType<typeof useConversationRuntimeBridge>;
  const rendered: ConversationToolCallProps[] = [];
  let tree!: ReactTestRenderer;
  const requests: RunAgentInput[] = [];
  let pendingSignal: AbortSignal | undefined;
  let release!: () => void;
  type ExecuteContext = Parameters<Extract<ConversationToolkit[string], { type: "frontend" }>["execute"]>[1];
  const execute = vi.fn(async (input: Record<string, unknown>, { abortSignal }: ExecuteContext) => {
    if (mode === "cancel") {
      pendingSignal = abortSignal;
      await new Promise<void>(resolve => { release = resolve; });
      abortSignal.throwIfAborted();
    }
    return { opened: input.id };
  });
  const render = (props: ConversationToolCallProps) => { rendered.push(props); return null; };
  const toolkit: ConversationToolkit = { open_ticket: {
    type: "frontend", description: "Open a ticket", parameters: { type: "object", properties: { id: { type: "string" } } },
    execute, render, disabled,
  } };
  const factory: NonNullable<Parameters<typeof ConversationRuntimeProvider>[0]["unstable_agentFactory"]> = ({ threadId }) => new HttpAgent({
    url: "https://example.test/agent", threadId,
    fetch: async (_url, init) => {
      const input = JSON.parse(String(init.body)) as RunAgentInput;
      requests.push(input);
      const run = { threadId: input.threadId, runId: input.runId };
      // Even an unsolicited backend call cannot execute a disabled tool.
      const events = requests.length === 1 ? [
        { type: "RUN_STARTED", ...run },
        { type: "TOOL_CALL_START", toolCallId: "call-1", toolCallName: "open_ticket", parentMessageId: "answer-1" },
        { type: "TOOL_CALL_ARGS", toolCallId: "call-1", delta: '{"id":"T-1"}' },
        { type: "TOOL_CALL_END", toolCallId: "call-1" },
        { type: "RUN_FINISHED", ...run },
      ] : [{ type: "RUN_STARTED", ...run }, { type: "RUN_FINISHED", ...run }];
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
    },
  });
  function Capture() {
    bridge = useConversationRuntimeBridge();
    native = useAui().threads.__internal_getAssistantRuntime!();
    return <ThreadPrimitive.Messages components={{
      AssistantMessage: () => <MessagePrimitive.Parts />,
      UserMessage: () => null,
    }} />;
  }
  const binding = createEphemeralConversationThreadBinding();
  await act(async () => { tree = create(<StrictMode><ConversationRuntimeProvider
    toolkit={toolkit} threadBinding={binding} unstable_agentFactory={factory}
  ><Capture /></ConversationRuntimeProvider></StrictMode>); });
  try {
    await until(() => !native.thread.getState().isLoading);
    let sent!: Promise<void>;
    await act(async () => { sent = bridge.agentRuntime.sendMessage("Open ticket T-1"); });
    const settled = sent.catch((error: unknown) => error);
    if (mode === "cancel") {
      await until(() => pendingSignal !== undefined);
      await act(async () => { bridge.agentRuntime.abort(); });
      expect(pendingSignal?.aborted).toBe(true);
      release();
      await settled;
      await act(async () => { await new Promise<void>(resolve => setTimeout(resolve, 20)); });
      expect(requests).toHaveLength(1);
      expect(native.thread.getState().isRunning).toBe(false);
      return;
    }
    await until(() => requests.length === (disabled ? 1 : 2) && !native.thread.getState().isRunning);
    await sent;
    if (disabled) {
      expect(requests[0]?.tools).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "open_ticket" })]));
      expect(execute).not.toHaveBeenCalled();
      return;
    }
    expect(execute).toHaveBeenCalledExactlyOnceWith({ id: "T-1" }, expect.objectContaining({ toolCallId: "call-1", abortSignal: expect.any(AbortSignal) }));
    expect(requests[0]?.tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: "open_ticket" })]));
    expect(requests[1]?.messages).toContainEqual(expect.objectContaining({ role: "tool", toolCallId: "call-1", content: '{"opened":"T-1"}' }));
    expect(rendered.at(-1)?.result).toEqual({ opened: "T-1" });
    const history: ConversationLoadedThread = { messages: native.thread.getState().messages };
    await act(async () => { tree.unmount(); });
    rendered.length = 0;
    const restored = { ...binding, loadThread: async () => history };
    await act(async () => { tree = create(<StrictMode><ConversationRuntimeProvider
      toolkit={{ open_ticket: { type: "backend", render } }} threadBinding={restored} unstable_agentFactory={factory}
    ><Capture /></ConversationRuntimeProvider></StrictMode>); });
    await until(() => !native.thread.getState().isLoading && rendered.at(-1)?.result !== undefined);
    expect(rendered.at(-1)?.result).toEqual({ opened: "T-1" });
    expect(execute).toHaveBeenCalledOnce();
    expect(requests).toHaveLength(2);
  } finally { await act(async () => tree.unmount()); }
});
