// @vitest-environment jsdom

import { HttpAgent, RunAgentInputSchema, type RunAgentInput } from "@ag-ui/client";
import { MessagePrimitive, ThreadPrimitive, useAui, type AssistantRuntime, type ToolCallMessagePartComponent } from "@assistant-ui/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { fileOutputScenario, runMockScenario } from "@agent-ui/mock-agent";
import { ConversationRuntimeProvider, createEphemeralConversationThreadBinding } from "@agent-ui/runtime-conversation";
import { ConversationToolFallback } from "../../src/index.js";
import plugin from "../../../source-registry/registry/items/plugin-generated-file-message/files/plugins/generated-file-message/definition";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function until(condition: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for generate_file runtime");
}

it("converts the real Mock SSE JSON result through react-ag-ui and resolves the named backend File UI", async () => {
  const requests: RunAgentInput[] = [];
  const agent = new HttpAgent({ url: "http://example.test/agent", fetch: async (_url, init) => {
    const input = RunAgentInputSchema.parse(JSON.parse(String(init.body)));
    requests.push(input);
    let body = "";
    for await (const event of runMockScenario(input, fileOutputScenario, { timingScale: 0 })) {
      body += `data: ${JSON.stringify(event)}\n\n`;
    }
    return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  } });
  let runtime: AssistantRuntime | undefined;
  const ToolFallback: ToolCallMessagePartComponent = props => <ConversationToolFallback {...props} />;
  function AssistantMessage() {
    return <MessagePrimitive.Root><MessagePrimitive.Parts components={{ tools: { Fallback: ToolFallback } }} /></MessagePrimitive.Root>;
  }
  function Capture() {
    runtime = useAui().threads.__internal_getAssistantRuntime?.();
    return <ThreadPrimitive.Root><ThreadPrimitive.Messages components={{ AssistantMessage, UserMessage: () => null }} /></ThreadPrimitive.Root>;
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
      captured.thread.append({ role: "user", content: [{ type: "text", text: "帮我生成一份 PDF 报告" }], startRun: true });
      await until(() => requests.length === 1 && !captured.thread.getState().isRunning);
    });
    const parts = captured.thread.getState().messages.flatMap(message => message.content);
    expect(parts).toContainEqual(expect.objectContaining({ type: "tool-call", toolName: "generate_file", result: {
      filename: "quarterly-report.pdf", mimeType: "application/pdf", url: "https://example.com/generated/quarterly-report.pdf",
    } }));
    expect(requests[0]?.tools.some(tool => tool.name === "generate_file")).toBe(false);
    const link = container.querySelector<HTMLAnchorElement>('a[data-slot="file-download"]');
    expect(link?.getAttribute("href")).toBe("https://example.com/generated/quarterly-report.pdf");
    expect(link?.getAttribute("download")).toBe("quarterly-report.pdf");
    expect(container.textContent).toContain("报告已经生成。");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
