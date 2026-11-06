import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useAui, ThreadPrimitive, MessagePrimitive, type AssistantRuntime } from "@assistant-ui/react";
import type { AgentRuntime } from "@za38.03/agent-ui-core";
import { ConversationToolResult, type ConversationToolCallProps, type ConversationToolkit } from "@za38.03/agent-ui-plugins";
import { describe, expect, it } from "vitest";
import { ConversationRuntimeProvider } from "../src/ConversationRuntimeProvider.js";
import { useConversationRuntimeBridge } from "../src/ConversationRuntimeBridgeContext.js";
import { createEphemeralConversationThreadBinding } from "../src/threads/ephemeral-thread-binding.js";
import { HttpAgent } from "@ag-ui/client";
import { runMockScenario } from "../../creator/src/mock-agent/scenario-runner.js";
import { askUserQuestionScenario } from "../../creator/src/mock-agent/builtins/ask-user-question.js";
import { frontendToolFillFormScenario } from "../../creator/src/mock-agent/builtins/frontend-tool-fill-form.js";
import { approvalLegacyScenario, approvalResumeScenario } from "../../creator/src/mock-agent/builtins/approval-resume.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type RunAgentInput = Parameters<typeof runMockScenario>[0];
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error("Tool lifecycle did not settle");
}
function AssistantMessage() {
  return <MessagePrimitive.Root><MessagePrimitive.Parts components={{ tools: { Fallback: ConversationToolResult } }} /></MessagePrimitive.Root>;
}
describe("human frontend tools through canonical runtime", () => {
  it.each([
    { scenario: askUserQuestionScenario, name: "ask_user_question", kind: "question", answer: { answers: { layout: ["dashboard"] } } },
    { scenario: frontendToolFillFormScenario, name: "collect_user_details", kind: "question", answer: { values: { firstName: "Bob", lastName: "Li", email: "bob@example.com", projectIdea: "Tasks" } } },
    { scenario: approvalLegacyScenario, name: "confirm_take_leave_policy", kind: "legacy", answer: { decisions: [{ type: "approve" }] } },
    { scenario: approvalResumeScenario, name: "confirm_take_leave_policy", kind: "native", answer: { decisions: [{ type: "approve" }] } },
  ])("uses the intended answer channel for $name ($kind)", async ({ scenario, name, answer, kind }) => {
    let bridge!: AgentRuntime;
    let native!: AssistantRuntime;
    let toolProps!: ConversationToolCallProps;
    const inputs: RunAgentInput[] = [];
    const toolkit: ConversationToolkit = { [name]: {
      type: "human", display: "standalone", description: "Collect input", parameters: { type: "object" },
      render: props => { toolProps = props; return null; },
    } };
    function Capture() {
      bridge = useConversationRuntimeBridge().agentRuntime;
      native = useAui().threads.__internal_getAssistantRuntime!();
      return <ThreadPrimitive.Messages components={{ AssistantMessage, UserMessage: () => null }} />;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<ConversationRuntimeProvider endpoint="http://example.test/tool" threadBinding={createEphemeralConversationThreadBinding()}
        {...(kind === "question" ? { toolkit } : {})}
        unstable_agentFactory={({ endpoint, threadId }) => new HttpAgent({ url: endpoint, threadId,
          fetch: async (_url, init) => {
            const input = JSON.parse(String(init.body)) as RunAgentInput;
            inputs.push(input);
            const chunks = [];
            for await (const event of runMockScenario(input, scenario, { timingScale: 0 })) chunks.push(`data: ${JSON.stringify(event)}\n\n`);
            return new Response(chunks.join(""), { headers: { "Content-Type": "text/event-stream" } });
          },
        })}><Capture /></ConversationRuntimeProvider>);
    });
    try {
      await until(() => !native.thread.getState().isLoading);
      let sent!: Promise<void>;
      await act(async () => { sent = bridge.sendMessage("Collect input"); });
      await until(() => kind === "question" ? toolProps?.status.type === "requires-action"
        : bridge.getSnapshot().run.status === "awaiting-input");
      expect(inputs).toHaveLength(1);
      if (kind !== "question") {
        expect(bridge.getSnapshot().run.status).toBe("awaiting-input");
        await expect(bridge.sendMessage("Change topic")).rejects.toThrow("pending interrupts");
        await act(async () => {
          const allow = renderer.root.findAll(node => node.type === "button" && node.children.includes("Allow"));
          const deny = renderer.root.findAll(node => node.type === "button" && node.children.includes("Deny"));
          expect(allow).toHaveLength(1);
          expect(deny).toHaveLength(1);
          allow[0]!.props.onClick();
        });
        await until(() => inputs.length === 2 && bridge.getSnapshot().run.status === "idle");
        await sent;
        if (kind === "native") {
          expect(inputs[1]!.resume).toEqual([{ interruptId: "approval-resume-1", status: "resolved", payload: answer }]);
          expect(inputs[1]!.forwardedProps.command).toBeUndefined();
          expect(inputs[1]!.messages.filter(message => message.role === "tool")).toEqual([]);
        } else {
          expect(inputs[1]!.resume).toBeUndefined();
          expect(inputs[1]!.forwardedProps.command).toEqual(answer);
          // Legacy continuation can carry upstream cancellation receipts for
          // unfinished calls. Approval itself must never be a fake Tool result.
          expect(inputs[1]!.messages.filter(message => message.role === "tool" && message.error === undefined)).toEqual([]);
        }
        expect(bridge.getSnapshot().interrupts).toEqual([]);
        return;
      }
      expect(toolProps.resumeInterrupt).toBeUndefined();
      expect(typeof toolProps.addResult).toBe("function");
      expect(bridge.getSnapshot().interrupts).toEqual([]);
      expect(native.thread.getState().isRunning).toBe(false);
      const callId = toolProps.toolCallId;
      await act(async () => { toolProps.addResult!(answer); });
      await until(() => inputs.length === 2 && !native.thread.getState().isRunning);
      await sent;
      expect(inputs[1]!.threadId).toBe(inputs[0]!.threadId);
      expect(inputs[1]!.runId).not.toBe(inputs[0]!.runId);
      expect(inputs[1]!.resume?.length ?? 0).toBe(0);
      expect(inputs[1]!.messages.filter(message => message.role === "user")).toHaveLength(1);
      expect(inputs[1]!.messages.filter(message => message.role === "tool")).toMatchObject([
        { toolCallId: callId, content: JSON.stringify(answer) },
      ]);
      expect(bridge.getSnapshot().interrupts).toEqual([]);
      expect(native.thread.getState().messages.reduce((count, message) => count +
        message.content.filter(part => part.type === "tool-call").length, 0)).toBe(1);
    } finally { await act(async () => { renderer.unmount(); }); }
  });
});
