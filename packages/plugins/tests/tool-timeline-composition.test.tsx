// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime, type AssistantRuntime, type ThreadMessage } from "@assistant-ui/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationThread, ConversationToolTimeline, ConversationTaskGroup } from "../src/public.js";
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
const EmptyScopedTransientMessages = () => <div data-testid="empty-transient-plugin-boundary" />;
async function mount(content: Content, enabled = true, tasks = false, status?: Extract<ThreadMessage, { role: "assistant" }>["status"]) {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  let runtime!: AssistantRuntime;
  function Host() {
    const current = useLocalRuntime({ run: async () => ({ content: [] }) }, { initialMessages: [message(content, status)] });
    useEffect(() => { runtime = current; }, [current]);
    return <AgentUILocaleProvider locale="en-US"><AssistantRuntimeProvider runtime={current}>
      <ConversationThread components={{ TransientMessages: EmptyScopedTransientMessages, ...(enabled ? { ToolTimeline: ConversationToolTimeline } : {}), ...(tasks ? { TaskGroup: ConversationTaskGroup } : {}) }} />
    </AssistantRuntimeProvider></AgentUILocaleProvider>;
  }
  await act(async () => root.render(<Host />));
  return { container, runtime };
}
afterEach(async () => { await act(async () => roots.splice(0).forEach(root => root.unmount())); document.body.replaceChildren(); });
describe("official message ToolTimeline composition", () => {
  it("does not mount empty scoped transient boundaries between transcript messages", async () => {
    const { container } = await mount([tool("a")]);
    const group = container.querySelector('[data-slot="aui_message-group"]')!;
    expect(group.querySelector('[data-testid="empty-transient-plugin-boundary"]')).toBeNull();
    expect(group.children).toHaveLength(1);
  });
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

const nestedTask = (extra = {}) => tool("parent-task", {
  toolName: "delegate_specialist", args: { task: "Inspect runtime" },
  messages: [{ ...message([{ type: "reasoning", text: "Partial subagent work" }]), id: "worker" }],
  ...extra,
});
const user = (id: string): ThreadMessage => ({
  id, role: "user", content: [{ type: "text", text: "Inspect runtime" }],
  attachments: [], createdAt: new Date(0), metadata: { custom: {} },
});

describe("Subagent presentation with ToolTimeline", () => {
  it.each(["cancelled", "error"] as const)("retains a %s parent task and its transcript", async reason => {
    const { container } = await mount([nestedTask({ result: undefined })], true, true,
      { type: "incomplete", reason, ...(reason === "error" ? { error: "Parent failed" } : {}) });
    const card = container.querySelector('[data-slot="task-card"]');
    expect(card?.getAttribute("data-state")).toBe(reason === "cancelled" ? "cancelled" : "failed");
    await act(async () => card!.querySelector<HTMLButtonElement>('button')!.click());
    expect(container.querySelector('[data-slot="task-card-transcript"]')?.textContent).toContain("Partial subagent work");
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).toBeNull();
  });

  it("keeps disclosure state when the assistant message receives its final ID", async () => {
    const { container, runtime } = await mount([nestedTask()], true, true);
    const card = container.querySelector('[data-slot="task-card"]');
    await act(async () => card!.querySelector<HTMLButtonElement>('button')!.click());
    await act(async () => runtime.thread.reset([{ ...message([nestedTask()]), id: "settled-message" }]));
    const settled = container.querySelector('[data-slot="task-card"]');
    expect(settled).not.toBe(card);
    expect(settled?.querySelector('button')?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector('[data-slot="task-card-transcript"]')?.textContent).toContain("Partial subagent work");
    await act(async () => settled!.querySelector<HTMLButtonElement>('button')!.click());
    await act(async () => runtime.thread.reset([{ ...message([nestedTask()]), id: "another-message-id" }]));
    expect(container.querySelector('[data-slot="task-card"] button')?.getAttribute("aria-expanded")).toBe("false");
  });

  it("isolates reused tool IDs across user requests and regenerated messages", async () => {
    const { container, runtime } = await mount([nestedTask()], true, true);
    const first = message([nestedTask()]);
    await act(async () => runtime.thread.reset([user("request-a"), first]));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-slot="task-card"] button')!.click());
    await act(async () => runtime.thread.reset([user("request-a"), first, user("request-b"), { ...first, id: "second-answer" }]));
    const buttons = container.querySelectorAll('[data-slot="task-card"] > button');
    expect([...buttons].map(button => button.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
    await act(async () => runtime.thread.reset([user("request-a"), { ...first, id: "regenerated-answer", createdAt: new Date(1000) }]));
    expect(container.querySelector('[data-slot="task-card"] button')?.getAttribute("aria-expanded")).toBe("false");
  });

  it("clears disclosure on thread switch and when the thread is emptied", async () => {
    const { container, runtime } = await mount([nestedTask()], true, true);
    await act(async () => container.querySelector<HTMLButtonElement>('[data-slot="task-card"] button')!.click());
    await act(async () => { await runtime.threads.mainItem.initialize(); });
    const previousThread = runtime.threads.getState().mainThreadId;
    await act(async () => { await runtime.threads.switchToNewThread(); });
    expect(runtime.threads.getState().mainThreadId).not.toBe(previousThread);
    await act(async () => { runtime.thread.reset([message([nestedTask()])]); });
    expect(container.querySelector('[data-slot="task-card"] button')?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => container.querySelector<HTMLButtonElement>('[data-slot="task-card"] button')!.click());
    await act(async () => runtime.thread.reset([]));
    await act(async () => runtime.thread.reset([message([nestedTask()])]));
    expect(container.querySelector('[data-slot="task-card"] button')?.getAttribute("aria-expanded")).toBe("false");
  });

  it("isolates child task disclosures between sibling Subagent messages", async () => {
    const child = { ...message([nestedTask()]), id: "child-a" };
    const { container } = await mount([nestedTask({ messages: [child, { ...child, id: "child-b" }] })], true, true);
    await act(async () => container.querySelector<HTMLButtonElement>('[data-slot="task-card"] > button')!.click());
    const cards = container.querySelectorAll('[data-slot="task-card"]');
    expect(cards).toHaveLength(3);
    await act(async () => cards[1]!.querySelector<HTMLButtonElement>('button')!.click());
    expect(cards[1]!.querySelector('button')?.getAttribute("aria-expanded")).toBe("true");
    expect(cards[2]!.querySelector('button')?.getAttribute("aria-expanded")).toBe("false");
  });
});
