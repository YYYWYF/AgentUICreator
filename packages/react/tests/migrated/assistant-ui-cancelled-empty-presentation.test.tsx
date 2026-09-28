// @vitest-environment jsdom

import {
  AssistantRuntimeProvider,
  AuiConfig,
  useLocalRuntime,
  type AssistantRuntime,
  type ChatModelAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConversationCanonicalAssistantResponseFooter,
  ConversationThread,
  TooltipProvider,
  useConversationResponseRuntime,
  type ConversationThreadLabels,
} from "../../src/index";
import { AGENT_UI_LOCALES } from "../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/i18n/locale-registry";

const roots: Root[] = [];
const adapter: ChatModelAdapter = { run: async () => ({ content: [] }) };
const config = AuiConfig({});
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function ResponseFooterProbe() {
  const response = useConversationResponseRuntime();
  return <>
    <span data-testid="response-text" data-text={response.text} />
    <ConversationCanonicalAssistantResponseFooter />
  </>;
}

function Fixture({ message, labels, onRuntime }: {
  message: ThreadMessageLike;
  labels: ConversationThreadLabels;
  onRuntime(runtime: AssistantRuntime): void;
}) {
  const runtime = useLocalRuntime(adapter, { initialMessages: [message] });
  useEffect(() => onRuntime(runtime), [runtime, onRuntime]);
  return <AssistantRuntimeProvider runtime={runtime} config={config}>
    <TooltipProvider><ConversationThread labels={labels} autoFocus={false}
      components={{ AssistantResponseFooter: ResponseFooterProbe }} /></TooltipProvider>
  </AssistantRuntimeProvider>;
}

async function mount(message: ThreadMessageLike) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  let runtime: AssistantRuntime | undefined;
  const onRuntime = (value: AssistantRuntime) => { runtime = value; };
  const render = async (labels: ConversationThreadLabels) => {
    await act(async () => root.render(<Fixture message={message} labels={labels} onRuntime={onRuntime} />));
  };
  await render(AGENT_UI_LOCALES["zh-CN"].conversation);
  if (runtime === undefined) throw new Error("Runtime was not captured");
  return { container, runtime, render };
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: () => undefined });
});

afterEach(async () => {
  await act(async () => { roots.splice(0).forEach((root) => root.unmount()); });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const fallbackSelector = '[data-slot="aui_assistant-message-cancelled"]';

describe("empty cancelled assistant presentation", () => {
  it("renders localized fallback without adding a message or real content", async () => {
    const { container, runtime, render } = await mount({
      id: "cancelled-empty", role: "assistant", content: [],
      status: { type: "incomplete", reason: "cancelled" },
    });
    expect(container.querySelector(fallbackSelector)?.textContent).toBe("已停止生成");
    expect(container.querySelector('[data-slot="aui_assistant-message-parts"]')).toBeNull();
    expect(runtime.thread.getState().messages).toHaveLength(1);
    expect(runtime.thread.getState().messages[0]).toMatchObject({
      id: "cancelled-empty", content: [], status: { type: "incomplete", reason: "cancelled" },
    });
    expect(container.querySelector('[data-testid="response-text"]')?.getAttribute("data-text")).toBe("");

    await render(AGENT_UI_LOCALES["en-US"].conversation);
    expect(container.querySelector(fallbackSelector)?.textContent).toBe("Generation stopped");
    expect(runtime.thread.getState().messages[0]?.content).toEqual([]);
    expect(container.querySelector('[data-testid="response-text"]')?.getAttribute("data-text")).toBe("");
  });

  it("preserves partial text without the fallback", async () => {
    const { container } = await mount({
      role: "assistant", content: [{ type: "text", text: "partial" }],
      status: { type: "incomplete", reason: "cancelled" },
    });
    expect(container.textContent).toContain("partial");
    expect(container.querySelector(fallbackSelector)).toBeNull();
  });

  it("counts an empty text part as content", async () => {
    const { container } = await mount({
      role: "assistant", content: [{ type: "text", text: "" }],
      status: { type: "incomplete", reason: "cancelled" },
    });
    expect(container.querySelector(fallbackSelector)).toBeNull();
  });

  it("counts a started tool call as content", async () => {
    const { container } = await mount({
      role: "assistant", content: [{
        type: "tool-call", toolCallId: "pending-tool", toolName: "inspect",
        args: {}, argsText: "{}",
      }],
      status: { type: "incomplete", reason: "cancelled" },
    });
    expect(container.querySelector(fallbackSelector)).toBeNull();
  });

  it.each([
    { type: "running" },
    { type: "incomplete", reason: "error", error: "Network failed" },
    { type: "complete", reason: "stop" },
  ] satisfies NonNullable<ThreadMessageLike["status"]>[])("does not show fallback for %j", async (status) => {
    const { container, runtime } = await mount({ role: "assistant", content: [], status });
    expect(runtime.thread.getState().messages[0]?.status).toMatchObject(status);
    expect(container.querySelector(fallbackSelector)).toBeNull();
    if (status.type === "incomplete") {
      expect(container.querySelector('.aui-message-error-message')?.textContent).toBe("Network failed");
    }
  });
});
