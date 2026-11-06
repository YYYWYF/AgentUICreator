import { MessagePrimitive, ThreadPrimitive, useAui, type AssistantRuntime } from "@assistant-ui/react";
import { ConversationToolFallback } from "@za38.03/agent-ui-plugins";
import type { ConversationAgentRuntimeBridge } from "../src/compatibility/conversation-runtime-bridge.js";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { ConversationRuntimeProvider } from "../src/ConversationRuntimeProvider.js";
import { useConversationRuntimeBridge } from "../src/ConversationRuntimeBridgeContext.js";
import { createEphemeralConversationThreadBinding } from "../src/threads/ephemeral-thread-binding.js";
import { HttpAgent } from "@ag-ui/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error("Command approval did not settle");
}

describe("ON_INTERRUPT command approvals through the installed AG-UI runtime", () => {
  it.each([false, true].flatMap(stop => ["approve", "reject"].flatMap(decision =>
    ["bridge", "fallback", "registered"].flatMap(surface =>
      ["uppercase-custom", "lowercase-custom", "native", "native-bound", "both"].map(format => ({ stop, decision, surface, format }))))))(
    "forwards $decision for $format through $surface after stop=$stop", async ({ stop, decision, surface, format }) => {
    let bridge!: ConversationAgentRuntimeBridge;
    let runtime!: AssistantRuntime;
    let renderer!: ReactTestRenderer;
    const inputs: Array<{ runId: string; threadId: string; forwardedProps: Record<string, unknown>; resume?: unknown; messages?: unknown }> = [];
    const binding = createEphemeralConversationThreadBinding();
    const native = format === "native" || format === "native-bound" || format === "both";
    const review = {
      action_requests: [{ name: "confirm_take_leave_policy", args: { user: "杨康", leave_policy: "年假" }, description: "请确认您的请假方案" }],
      review_configs: [{ action_name: "confirm_take_leave_policy", allowed_decisions: ["approve", "edit", "reject", "respond"] }],
    };
    function AssistantMessage() {
      return <MessagePrimitive.Root>
        <MessagePrimitive.Parts components={{ tools: { Fallback: ConversationToolFallback } }} />
      </MessagePrimitive.Root>;
    }
    function Capture() {
      bridge = useConversationRuntimeBridge().agentRuntime;
      runtime = useAui().threads.__internal_getAssistantRuntime!();
      return surface !== "bridge" ? <ThreadPrimitive.Messages components={{ AssistantMessage, UserMessage: () => null }} /> : null;
    }
    await act(async () => {
      renderer = create(<ConversationRuntimeProvider endpoint="http://example.test/command" threadBinding={binding}
        {...(surface === "registered" ? { toolkit: { confirm_take_leave_policy: {
          type: "human" as const, display: "standalone" as const,
          interaction: { type: "interrupt" as const }, render: ConversationToolFallback,
        } } } : {})}
        unstable_agentFactory={({ endpoint, threadId }) => new HttpAgent({ url: endpoint, threadId,
          fetch: async (_url, init) => {
            const input = JSON.parse(String(init.body)) as typeof inputs[number];
            inputs.push(input);
            const encoder = new TextEncoder();
            const body = new ReadableStream<Uint8Array>({ start(controller) {
              const emit = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              emit({ type: "RUN_STARTED", runId: input.runId, threadId });
              if (inputs.length === 1) {
                emit({ type: "TOOL_CALL_START", toolCallId: "delete-1", toolCallName: "confirm_take_leave_policy" });
                emit({ type: "TOOL_CALL_ARGS", toolCallId: "delete-1", delta: JSON.stringify(review.action_requests[0]!.args) });
                emit({ type: "TOOL_CALL_END", toolCallId: "delete-1" });
                if (!native || format === "both") emit({ type: "CUSTOM",
                  name: format === "uppercase-custom" ? "ON_INTERRUPT" : "on_interrupt",
                  value: format === "uppercase-custom" ? review : JSON.stringify(review),
                });
                emit({ type: "RUN_FINISHED", runId: input.runId, threadId,
                  ...(native ? { outcome: { type: "interrupt", interrupts: [{
                    id: "leave-approval", reason: "langgraph:interrupt",
                    ...(format === "native-bound" ? { toolCallId: "delete-1" } : {}),
                    metadata: { langgraph: { raw: review, ns: null, resumable: null, when: null } },
                  }] } } : {}),
                });
                if (stop) {
                  init.signal?.addEventListener("abort", () => controller.error(new Error("BodyStreamBuffer was aborted")), { once: true });
                  return;
                }
              } else {
                emit({ type: "TOOL_CALL_RESULT", toolCallId: "delete-1", messageId: "result-1", content: "deleted" });
                emit({ type: "RUN_FINISHED", runId: input.runId, threadId });
              }
              controller.close();
            } });
            return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
          },
        })}><Capture /></ConversationRuntimeProvider>);
    });
    try {
      await until(() => !runtime.thread.getState().isLoading);
      let sent!: Promise<void>;
      await act(async () => { sent = bridge.sendMessage("Delete the draft"); });
      await until(() => bridge.getCommandDecisionRequest("delete-1") !== undefined);
      if (stop) {
        await act(async () => { bridge.abort(); });
      }
      await until(() => !runtime.thread.getState().isRunning);
      await sent;
      expect(bridge.getSnapshot().run.status).toBe("awaiting-input");
      expect(bridge.getSnapshot().interrupts).toHaveLength(native ? 1 : 0);
      expect(bridge.getCommandDecisionRequest("delete-1")?.allowedDecisions).toEqual(["approve", "reject"]);
      expect(bridge.getCommandDecisionRequest("delete-1")?.description).toBe("请确认您的请假方案");
      await expect(bridge.sendMessage("Another task")).rejects.toThrow("pending interrupts");
      await expect(bridge.submitCommandDecision("delete-1", "edit")).rejects.toThrow("Unsupported command decision");
      expect(inputs).toHaveLength(1);
      let submitted!: Promise<void>;
      await act(async () => {
        if (surface === "bridge") submitted = bridge.submitCommandDecision("delete-1", decision);
        else {
          const buttons = renderer.root.findAll(node => node.type === "button");
          expect(buttons.filter(node => node.children.includes("Allow"))).toHaveLength(1);
          expect(buttons.filter(node => node.children.includes("Deny"))).toHaveLength(1);
          expect(buttons.some(node => node.children.includes("edit") || node.children.includes("respond"))).toBe(false);
          const button = buttons.find(node => node.children.includes(decision === "approve" ? "Allow" : "Deny"));
          expect(button, "default fallback must retain the pending command controls").toBeDefined();
          button!.props.onClick();
          submitted = Promise.resolve();
        }
      });
      await until(() => inputs.length === 2 && bridge.getSnapshot().run.status === "idle");
      await submitted;
      if (native) {
        expect(inputs[1]!.forwardedProps.command).toBeUndefined();
        expect(inputs[1]!.resume).toEqual([{ interruptId: "leave-approval", status: "resolved", payload: {
          decisions: [{ type: decision }],
        } }]);
      } else {
        expect(inputs[1]!.forwardedProps.command).toEqual({ decisions: [{ type: decision }] });
        expect(inputs[1]!.resume).toBeUndefined();
      }
      expect(JSON.stringify(inputs[1]!.messages)).not.toMatch(/Approved by user|User denied tool execution/u);
      expect(inputs[1]!.threadId).toBe(inputs[0]!.threadId);
      expect(bridge.getCommandDecisionRequest("delete-1")).toBeUndefined();
    } finally {
      await act(async () => { renderer.unmount(); });
    }
  });
});
