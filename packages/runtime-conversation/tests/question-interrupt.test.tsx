import type { ComponentType } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useAui } from "@assistant-ui/react";
import type { AgentRuntime } from "@agent-ui/runtime-core";
import type { ConversationToolCallProps, ConversationToolkit } from "@agent-ui/react";
import { describe, expect, it } from "vitest";
import { ConversationRuntimeProvider } from "../src/ConversationRuntimeProvider.js";
import { useConversationRuntimeBridge } from "../src/ConversationRuntimeBridgeContext.js";
import { createEphemeralConversationThreadBinding } from "../src/threads/ephemeral-thread-binding.js";
import { CancellationAwareHttpAgent } from "../src/compatibility/cancellation-aware-http-agent.js";
import { createAssistantUiFrontendToolkit } from "../src/tools/assistant-ui-frontend-tool-adapter.js";
import { runMockScenario } from "../../mock-agent/src/scenario-runner.js";
import { askUserQuestionScenario } from "../../mock-agent/src/builtins/ask-user-question.js";

type RunAgentInput = Parameters<typeof runMockScenario>[0];

async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error("Question lifecycle did not settle");
}

describe("question tool through canonical runtime", () => {
  it("pauses, sends only resume answers and receives the backend result", async () => {
    let bridge!: AgentRuntime;
    let toolProps!: ConversationToolCallProps;
    let loaded = false;
    const inputs: RunAgentInput[] = [];
    const toolkit: ConversationToolkit = { ask_user_question: {
      type: "human", display: "standalone", interaction: { type: "interrupt" },
      description: "Ask", parameters: { type: "object" },
      render: props => { toolProps = props; return null; },
    } };
    const Render = createAssistantUiFrontendToolkit(undefined, toolkit).ask_user_question!.render! as ComponentType<ConversationToolCallProps>;
    function Capture() {
      bridge = useConversationRuntimeBridge().agentRuntime;
      const runtime = useAui().threads.__internal_getAssistantRuntime!();
      loaded = !runtime.thread.getState().isLoading;
      return <Render type="tool-call" toolCallId="question-layout-call" toolName="ask_user_question" args={{}}
        argsText="{}" status={{ type: "requires-action", reason: "tool-calls" }} addResult={() => { throw new Error("Client result forbidden"); }} />;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<ConversationRuntimeProvider endpoint="http://example.test/question" threadBinding={createEphemeralConversationThreadBinding()} toolkit={toolkit}
        unstable_agentFactory={({ endpoint, threadId }) => new CancellationAwareHttpAgent({ url: endpoint, threadId,
          fetch: async (_url, init) => {
            const input = JSON.parse(String(init.body)) as RunAgentInput;
            inputs.push(input);
            const chunks = [];
            for await (const event of runMockScenario(input, askUserQuestionScenario, { timingScale: 0 })) chunks.push(`data: ${JSON.stringify(event)}\n\n`);
            return new Response(chunks.join(""), { headers: { "Content-Type": "text/event-stream" } });
          },
        })}><Capture /></ConversationRuntimeProvider>);
    });
    try {
      await until(() => loaded);
      let sent!: Promise<void>;
      await act(async () => { sent = bridge.sendMessage("Design a homepage"); });
      await until(() => bridge.getSnapshot().run.status === "awaiting-input" && typeof toolProps.resumeInterrupt === "function");
      await sent;
      expect(inputs).toHaveLength(1);
      expect(toolProps.addResult).toBeUndefined();
      expect(bridge.getSnapshot().interrupts).toMatchObject([{ id: "question-layout", toolExecutionId: "question-layout-call" }]);
      await expect(bridge.sendMessage("Dashboard")).rejects.toThrow("pending interrupts");
      const answer = { answers: { layout: ["dashboard"] } };
      await act(async () => { await toolProps.resumeInterrupt!(answer); });
      await until(() => bridge.getSnapshot().run.status === "idle");
      expect(inputs).toHaveLength(2);
      expect(inputs[1]!.threadId).toBe(inputs[0]!.threadId);
      expect(inputs[1]!.runId).not.toBe(inputs[0]!.runId);
      expect(inputs[1]!.resume).toEqual([{ interruptId: "question-layout", status: "resolved", payload: answer }]);
      expect(inputs[1]!.messages.filter(message => message.role === "user")).toHaveLength(1);
      expect(inputs[1]!.messages.some(message => message.role === "tool")).toBe(false);
      expect(bridge.getSnapshot().interrupts).toEqual([]);
      expect(bridge.getSnapshot().executions).toEqual(expect.arrayContaining([expect.objectContaining({
        type: "tool", id: "question-layout-call", status: "completed",
        result: expect.objectContaining({ content: JSON.stringify(answer) }),
      })]));
      expect(toolProps.resumeInterrupt).toBeUndefined();
    } finally { await act(async () => { renderer.unmount(); }); }
  });
});
