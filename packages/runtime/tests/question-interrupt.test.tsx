import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useAui, ThreadPrimitive, MessagePrimitive, type AssistantRuntime } from "@assistant-ui/react";
import type { AgentRuntime } from "@za38.03/agent-ui-core";
import type { ConversationToolCallProps, ConversationToolkit } from "@za38.03/agent-ui-plugins";
import { describe, expect, it } from "vitest";
import { ConversationRuntimeProvider } from "../src/ConversationRuntimeProvider.js";
import { useConversationRuntimeBridge } from "../src/ConversationRuntimeBridgeContext.js";
import { createEphemeralConversationThreadBinding } from "../src/threads/ephemeral-thread-binding.js";
import { CancellationAwareHttpAgent } from "../src/compatibility/cancellation-aware-http-agent.js";
import { runMockScenario } from "../../creator/src/mock-agent/scenario-runner.js";
import { askUserQuestionScenario } from "../../creator/src/mock-agent/builtins/ask-user-question.js";
import { frontendToolFillFormScenario } from "../../creator/src/mock-agent/builtins/frontend-tool-fill-form.js";
import { approvalResumeScenario } from "../../creator/src/mock-agent/builtins/approval-resume.js";

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
  return <MessagePrimitive.Root><MessagePrimitive.Content /></MessagePrimitive.Root>;
}
describe("human frontend tools through canonical runtime", () => {
  it.each([
    { scenario: askUserQuestionScenario, name: "ask_user_question", interrupt: false, answer: { answers: { layout: ["dashboard"] } } },
    { scenario: frontendToolFillFormScenario, name: "collect_user_details", interrupt: false, answer: { values: { firstName: "Bob", lastName: "Li", email: "bob@example.com", projectIdea: "Tasks" } } },
    { scenario: approvalResumeScenario, name: "delete_generated_artifacts", interrupt: true, answer: { approved: true } },
  ])("uses the intended answer channel for $name", async ({ scenario, name, answer, interrupt }) => {
    let bridge!: AgentRuntime;
    let native!: AssistantRuntime;
    let toolProps!: ConversationToolCallProps;
    const inputs: RunAgentInput[] = [];
    const toolkit: ConversationToolkit = { [name]: {
      type: "human", display: "standalone", description: "Collect input", parameters: { type: "object" },
      ...(interrupt ? { interaction: { type: "interrupt" as const } } : {}),
      render: props => { toolProps = props; return null; },
    } };
    function Capture() {
      bridge = useConversationRuntimeBridge().agentRuntime;
      native = useAui().threads.__internal_getAssistantRuntime!();
      return <ThreadPrimitive.Messages components={{ AssistantMessage, UserMessage: () => null }} />;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<ConversationRuntimeProvider endpoint="http://example.test/tool" threadBinding={createEphemeralConversationThreadBinding()} toolkit={toolkit}
        unstable_agentFactory={({ endpoint, threadId }) => new CancellationAwareHttpAgent({ url: endpoint, threadId,
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
      await until(() => toolProps?.status.type === "requires-action");
      expect(inputs).toHaveLength(1);
      if (interrupt) {
        expect(toolProps.addResult).toBeUndefined();
        expect(typeof toolProps.resumeInterrupt).toBe("function");
        expect(bridge.getSnapshot().run.status).toBe("awaiting-input");
        await expect(bridge.sendMessage("Change topic")).rejects.toThrow("pending interrupts");
        let resumed!: Promise<void>;
        await act(async () => { resumed = toolProps.resumeInterrupt!(answer); });
        await until(() => inputs.length === 2 && bridge.getSnapshot().run.status === "idle");
        await resumed; await sent;
        expect(inputs[1]!.resume).toEqual([{ interruptId: "approval-resume-1", status: "resolved", payload: answer }]);
        expect(inputs[1]!.messages.some(message => message.role === "tool")).toBe(false);
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
