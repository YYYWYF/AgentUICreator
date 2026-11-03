import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { describe, expect, it, vi } from "vitest";
import {
  AgentUIProvider, AgentUIConversationBinding, useAgentUI, useAgentUIAppEvent,
  ConversationRuntimeProvider, createAgentUIFrontendTools, createEphemeralConversationThreadBinding,
  type AgentUIHost,
} from "../src/public.js";
import { HttpAgent } from "@ag-ui/client";

async function until(predicate: () => boolean) {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error("HOST_INTERACTION_DID_NOT_SETTLE");
}

describe("public Host interactions through the canonical Agent runtime", () => {
  it.each([false, "host", "composer"] as const)("delivers events and handles the native Host-tool roundtrip (cancel=%s)", async cancel => {
    let host!: AgentUIHost, native!: AssistantRuntime, tree!: ReactTestRenderer;
    let nativeClient!: ReturnType<typeof useAui>;
    const events = vi.fn(), opened = vi.fn(); const requests: Record<string, any>[] = [];
    const errors: Error[] = [];
    let activeSignal: AbortSignal | undefined;
    let finish: (() => void) | undefined;
    const tools = createAgentUIFrontendTools([{
      name: "open_ticket", description: "Open a Host ticket", inputSchema: { type: "object", properties: { ticketId: { type: "string" } }, required: ["ticketId"] },
      async execute(input, { signal, toolCallId }) {
        if (!input || typeof input !== "object" || !("ticketId" in input) || typeof input.ticketId !== "string") throw new Error("INVALID_TICKET_ID");
        if (cancel) { activeSignal = signal; await new Promise<void>(resolve => { finish = resolve; }); }
        signal.throwIfAborted(); opened(input.ticketId, toolCallId); return { opened: input.ticketId };
      },
    }]);
    function Page() { host = useAgentUI(); useAgentUIAppEvent("app.ticket.selected", events); return null; }
    function Native() { nativeClient = useAui(); native = nativeClient.threads.__internal_getAssistantRuntime!(); return <AgentUIConversationBinding />; }
    await act(async () => { tree = create(<AgentUIProvider><Page />
      <ConversationRuntimeProvider endpoint="https://example.test/agent" threadBinding={createEphemeralConversationThreadBinding()} frontendTools={tools}
        onError={error => errors.push(error)} unstable_agentFactory={({ threadId }) => new HttpAgent({
          url: "https://example.test/agent", threadId,
          fetch: async (_url, init) => {
            const input = JSON.parse(String(init?.body)); requests.push(input);
            const run = { threadId: input.threadId, runId: input.runId };
            const body = requests.length === 1 ? [
              { type: "RUN_STARTED", ...run },
              { type: "CUSTOM", name: "app.ticket.selected", value: { ticketId: "T-1" } },
              { type: "TOOL_CALL_START", toolCallId: "open-1", toolCallName: "open_ticket", parentMessageId: "answer-1" },
              { type: "TOOL_CALL_ARGS", toolCallId: "open-1", delta: '{"ticketId":"T-1"}' },
              { type: "TOOL_CALL_END", toolCallId: "open-1" },
              { type: "RUN_FINISHED", ...run },
            ] : [
              { type: "RUN_STARTED", ...run },
              { type: "TEXT_MESSAGE_START", messageId: "answer-2", role: "assistant" },
              { type: "TEXT_MESSAGE_CONTENT", messageId: "answer-2", delta: "Opened" },
              { type: "TEXT_MESSAGE_END", messageId: "answer-2" },
              { type: "RUN_FINISHED", ...run },
            ];
            return new Response(body.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
          },
        })}><Native /></ConversationRuntimeProvider>
    </AgentUIProvider>); });
    try {
      await until(() => host.getSnapshot().status === "ready" && !native.thread.getState().isLoading);
      let sent!: Promise<void>;
      await act(async () => { sent = host.sendMessage("Open ticket T-1"); });
      const settled = sent.catch(error => error);
      if (cancel) {
        await until(() => activeSignal !== undefined);
        await act(async () => {
          if (cancel === "composer") nativeClient.composer.cancel();
          else host.abortRun();
        });
        await until(() => !native.thread.getState().isRunning);
        expect(activeSignal!.aborted).toBe(true);
        await act(async () => { finish!(); await new Promise(resolve => setTimeout(resolve, 20)); });
        await settled;
        expect(opened).not.toHaveBeenCalled();
        expect(requests, JSON.stringify(requests.map(request => ({messages:request.messages,runId:request.runId})), null, 2)).toHaveLength(1);
        expect(events).toHaveBeenCalledOnce();
        let next!: Promise<void>;
        await act(async () => { next = host.sendMessage("A fresh request after cancelling"); });
        await until(() => requests.length === 2 && !native.thread.getState().isRunning);
        await next;
        expect(requests[1]!.messages.filter((message: any) => message.role === "user")).toHaveLength(2);
        expect(errors).toEqual([]);
        return;
      }
      await until(() => requests.length === 2 && !native.thread.getState().isRunning);
      await settled;
      expect(errors).toEqual([]);
      expect(events).toHaveBeenCalledExactlyOnceWith({ name: "app.ticket.selected", payload: { ticketId: "T-1" }, producer: { type: "root" } });
      expect(opened).toHaveBeenCalledExactlyOnceWith("T-1", "open-1");
      expect(requests[0]!.tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: "open_ticket" })]));
      expect(requests[1]!.threadId).toBe(requests[0]!.threadId);
      expect(requests[1]!.messages.filter((message: any) => message.role === "user")).toHaveLength(1);
      expect(requests[1]!.messages.filter((message: any) => message.role === "tool")).toMatchObject([{ toolCallId: "open-1", content: '{"opened":"T-1"}' }]);
      expect(requests[1]!.resume).toBeUndefined();
    } finally { await act(async () => tree.unmount()); }
  });
});
