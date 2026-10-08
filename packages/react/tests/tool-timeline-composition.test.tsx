// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime, type AssistantRuntime, type ThreadMessage } from "@assistant-ui/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationThread, ConversationToolTimeline } from "../src/public.js";
import { AgentUILocaleProvider } from "../src/locale.js";
const roots: Root[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: () => undefined });
type Content = Extract<ThreadMessage, { role: "assistant" }>["content"];
function message(content: Content, status: Extract<ThreadMessage, { role: "assistant" }>["status"] = { type: "complete", reason: "stop" }): ThreadMessage {
  return { id: "assistant-1", role: "assistant", content, status, createdAt: new Date(0), metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} } };
}
const tool = (id: string, extra = {}) => ({ type: "tool-call" as const, toolCallId: id, toolName: "read_file", args: {}, argsText: "{}", result: { ok: true }, ...extra });
async function mount(content: Content, enabled = true) {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  let runtime!: AssistantRuntime;
  function Host() {
    const current = useLocalRuntime({ run: async () => ({ content: [] }) }, { initialMessages: [message(content)] });
    useEffect(() => { runtime = current; }, [current]);
    return <AgentUILocaleProvider locale="en-US"><AssistantRuntimeProvider runtime={current}>
      <ConversationThread components={enabled ? { ToolTimeline: ConversationToolTimeline } : {}} />
    </AssistantRuntimeProvider></AgentUILocaleProvider>;
  }
  await act(async () => root.render(<Host />));
  return { container, runtime };
}
afterEach(async () => { await act(async () => roots.splice(0).forEach(root => root.unmount())); document.body.replaceChildren(); });
describe("official message ToolTimeline composition", () => {
  it("T02 renders a single collapsed summary with three same-name tool calls", async () => {
    const { container } = await mount([tool("a"), tool("b"), tool("c")]);
    expect(container.querySelectorAll('[data-slot="tool-timeline"]')).toHaveLength(1);
    expect(container.textContent).toContain("Executed 3 steps");
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('[data-slot="tool-timeline"] button')!.click());
    expect(container.textContent).toContain("Read file");
    expect(container.textContent).toContain("Original tool details");
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === "Original tool details")!.click());
    expect(container.querySelectorAll('[data-slot="tool-fallback-root"]')).toHaveLength(3);
  });
  it("T03 preserves the open timeline across streaming append and text interleave", async () => {
    const { container, runtime } = await mount([tool("a"), { type: "text", text: "between" }, tool("b")]);
    const node = container.querySelector('[data-slot="tool-timeline"]');
    await act(async () => node!.querySelector<HTMLButtonElement>('button')!.click());
    await act(async () => runtime.thread.reset([message([tool("a"), { type: "text", text: "between" }, tool("b"), tool("c")])]));
    expect(container.querySelectorAll('[data-slot="tool-timeline"]')).toHaveLength(1);
    expect(container.querySelector('[data-slot="tool-timeline"]')).toBe(node);
    expect(node!.querySelector('button')!.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("between");
    expect(container.textContent).toContain("Executed 3 steps");
  });
  it("T04 keeps failed raw detail visible even with summary collapsed", async () => {
    const { container } = await mount([tool("error", { result: { error: "failed" }, isError: true })]);
    expect(container.querySelector('[data-slot="tool-timeline"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).not.toBeNull();
  });
  it("T01/T15 leaves plain text unchanged and restores ToolGroup without Timeline", async () => {
    const plain = await mount([{ type: "text", text: "answer" }]);
    expect(plain.container.querySelector('[data-slot="tool-timeline"]')).toBeNull();
    const disabled = await mount([tool("a")], false);
    expect(disabled.container.querySelector('[data-slot="tool-group-root"]')).not.toBeNull();
    expect(disabled.container.querySelector('[data-slot="tool-timeline"]')).toBeNull();
  });
});
