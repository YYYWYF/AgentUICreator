// @vitest-environment jsdom

import { HttpAgent, RunAgentInputSchema, type RunAgentInput } from "@ag-ui/client";
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { sourceCitationsScenario, runMockScenario } from "@agent-ui/mock-agent";
import { ConversationRuntimeProvider, createEphemeralConversationThreadBinding } from "@agent-ui/runtime-conversation";
import { ConversationThread, TooltipProvider } from "../../src/index.js";
import plugin from "../../../source-registry/registry/items/plugin-source-citations-message/files/plugins/source-citations-message/definition";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function until(condition: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for search_sources runtime");
}

it("converts the real Mock SSE JSON result through react-ag-ui and resolves the named backend Sources UI", async () => {
  const requests: RunAgentInput[] = [];
  const events: { type: string; content?: unknown }[] = [];
  const agent = new HttpAgent({ url: "http://example.test/agent", fetch: async (_url, init) => {
    const input = RunAgentInputSchema.parse(JSON.parse(String(init.body)));
    requests.push(input);
    let body = "";
    for await (const event of runMockScenario(input, sourceCitationsScenario, { timingScale: 0 })) {
      events.push(event);
      body += `data: ${JSON.stringify(event)}\n\n`;
    }
    return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  } });
  let runtime: AssistantRuntime | undefined;
  function Capture() {
    runtime = useAui().threads.__internal_getAssistantRuntime?.();
    return <TooltipProvider><ConversationThread autoFocus={false} composer={null} /></TooltipProvider>;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const binding = createEphemeralConversationThreadBinding();
  try {
    await act(async () => root.render(
      <ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding}
        toolkit={plugin.toolkit} unstable_agentFactory={() => agent}><Capture /></ConversationRuntimeProvider>,
    ));
    if (!runtime) throw new Error("Assistant runtime was not captured");
    const captured = runtime;
    await act(async () => until(() => !captured.thread.getState().isLoading));
    await act(async () => {
      captured.thread.append({ role: "user", content: [{ type: "text", text: "查找 React 19 迁移参考来源" }], startRun: true });
      await until(() => requests.length === 1 && !captured.thread.getState().isRunning);
    });
    const parts = captured.thread.getState().messages.flatMap(message => message.role === "assistant" ? message.content : []);
    const toolStep = sourceCitationsScenario.steps.find(step => step.type === "tool");
    if (!toolStep || toolStep.type !== "tool") throw new Error("Missing search_sources step");
    const wireResult = events.find(event => event.type === "TOOL_CALL_RESULT");
    expect(typeof wireResult?.content).toBe("string");
    expect(JSON.parse(String(wireResult?.content))).toEqual(toolStep.result);
    expect(parts).toContainEqual(expect.objectContaining({ type: "tool-call", toolName: "search_sources", result: toolStep.result }));
    expect(parts.some(part => part.type === "source")).toBe(false);
    expect(requests[0]?.tools.some(tool => tool.name === "search_sources")).toBe(false);
    expect(events.some(event => event.type === "CUSTOM" || String(event.type).startsWith("SOURCE_"))).toBe(false);
    expect(events.filter(event => String(event.type).startsWith("TOOL_CALL_")).map(event => event.type)).toEqual([
      "TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END", "TOOL_CALL_RESULT",
    ]);
    expect(events.findIndex(event => event.type === "TOOL_CALL_RESULT")).toBeLessThan(events.findIndex(event => event.type === "TEXT_MESSAGE_START"));
    expect(container.querySelectorAll('[data-slot="source"]')).toHaveLength(2);
    expect(container.querySelector('a[data-slot="source"]')?.getAttribute("href")).toBe("https://react.dev/blog/2024/12/05/react-19");
    expect(container.querySelector('[data-slot="source-document-icon"]')).not.toBeNull();
    expect(container.textContent).toContain("Internal migration guide");
    expect(container.textContent).toContain("可参考 React 19 官方说明和内部迁移指南。");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
