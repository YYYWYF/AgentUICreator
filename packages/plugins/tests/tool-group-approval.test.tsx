// @vitest-environment jsdom
import { act, useMemo, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime, type ThreadMessageLike } from "@assistant-ui/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  AgentUILocaleProvider,
  ConversationCanonicalToolGroup,
  ConversationCommandDecisionProvider,
  ConversationThread,
  ConversationToolFallback,
  toConversationMessagePartGroup,
  type ConversationCommandDecisionBinding,
  type ConversationMessagePartGroup,
} from "../src/public.js";
import { ConversationToolGroupPlugin as PackageGroup } from "../dist/tool-group/index.js";
import { ConversationToolGroupPlugin as PortableGroup } from "../dist/sources/takeover/tool-group/index";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value() {} });
const roots: Root[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach(root => root.unmount()));
  document.body.replaceChildren();
});
async function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(node));
  return { container, root };
}
const frameworkProps = { renderSlot: () => null, renderScopedSlot: () => null };
const implementations = [
  { name: "built-in", Group: undefined },
  { name: "npm", Group: PackageGroup },
  { name: "portable", Group: PortableGroup },
];
const tool = { type: "tool-call" as const, toolCallId: "leave", toolName: "confirm_take_leave_policy", args: { user: "杨康", leave_policy: "年假" } };
const toggle = (container: HTMLElement) => container.querySelector<HTMLButtonElement>('[data-slot="tool-group-trigger"]')!;

function Host({ content, decisions = new Map(), Group }: {
  content: ThreadMessageLike["content"];
  decisions?: ReadonlyMap<string, ConversationCommandDecisionBinding>;
  Group?: ComponentType<typeof frameworkProps & { group: ConversationMessagePartGroup; children?: ReactNode }> | undefined;
}) {
  const runtime = useLocalRuntime({ async *run() {} }, { initialMessages: [{ id: "answer", role: "assistant", content }] });
  const ToolGroup = useMemo(() => Group ? function ScopedGroup({ group, children }: { group: unknown; children?: ReactNode }) {
    return <Group {...frameworkProps} group={toConversationMessagePartGroup(group)}>{children}</Group>;
  } : undefined, [Group]);
  return <AssistantRuntimeProvider runtime={runtime}><AgentUILocaleProvider locale="zh-CN">
    <ConversationCommandDecisionProvider decisions={decisions}>
      <ConversationThread composer={null} components={{
        ToolFallback: ConversationToolFallback,
        ...(ToolGroup ? { ToolGroup } : {}),
      }} />
    </ConversationCommandDecisionProvider>
  </AgentUILocaleProvider></AssistantRuntimeProvider>;
}

it.each(implementations)("$name group expands native approval even when the last tool is complete", async ({ Group }) => {
  const { container } = await mount(<Host Group={Group} content={[
    { ...tool, approval: { id: "approval", prompt: "请确认您的请假方案" } },
    { ...tool, toolCallId: "done", result: "done" },
  ]} />);
  expect(toggle(container).getAttribute("aria-expanded")).toBe("true");
  expect(container.querySelector('[data-slot="tool-fallback-trigger"]')?.getAttribute("aria-expanded")).toBe("true");
  expect(container.querySelector('[data-slot="tool-fallback-approval"]')?.textContent).toContain("请确认您的请假方案");
  expect([...container.querySelectorAll("button")].map(button => button.textContent)).toContain("允许");
});

it.each(implementations)("$name group opens for a late command decision and respects manual collapse", async ({ Group }) => {
  const content = [{ ...tool, result: "review pending" }];
  const submit = vi.fn().mockResolvedValue(undefined);
  const decisions = new Map<string, ConversationCommandDecisionBinding>([[tool.toolCallId, {
    request: { description: "请确认您的请假方案", allowedDecisions: ["approve", "reject"] }, submit,
  }]]);
  const { container, root } = await mount(<Host Group={Group} content={content} />);
  expect(toggle(container).getAttribute("aria-expanded")).toBe("false");
  const group = container.querySelector('[data-slot="tool-group-root"]');
  await act(async () => root.render(<Host Group={Group} content={content} decisions={decisions} />));
  expect(toggle(container).getAttribute("aria-expanded")).toBe("true");
  expect(container.querySelector('[data-slot="tool-group-root"]')).toBe(group);
  expect(container.querySelector('[data-slot="tool-fallback-trigger"]')?.getAttribute("aria-expanded")).toBe("true");
  await act(async () => toggle(container).click());
  await act(async () => root.render(<Host Group={Group} content={content} decisions={new Map(decisions)} />));
  expect(toggle(container).getAttribute("aria-expanded")).toBe("false");
  await act(async () => root.render(<Host Group={Group} content={content} />));
  await act(async () => root.render(<Host Group={Group} content={content} decisions={decisions} />));
  expect(toggle(container).getAttribute("aria-expanded")).toBe("true");
  const allow = [...container.querySelectorAll("button")].find(button => button.textContent === "允许")!;
  await act(async () => allow.click());
  expect(submit).toHaveBeenCalledExactlyOnceWith("approve");
});

it("preserves explicit controlled expansion and forwards user toggles", async () => {
  const changed = vi.fn();
  function ControlledHost({ pending = false }: { pending?: boolean }) {
    const runtime = useLocalRuntime({ async *run() {} });
    return <AssistantRuntimeProvider runtime={runtime}>
      <ConversationCanonicalToolGroup group={{ type: "group-tool", indices: [0], status: { type: "complete" }, requiresAction: pending }} expanded={false} onExpandedChange={changed}>details</ConversationCanonicalToolGroup>
    </AssistantRuntimeProvider>;
  }
  const { container, root } = await mount(<ControlledHost />);
  await act(async () => root.render(<ControlledHost pending />));
  expect(toggle(container).getAttribute("aria-expanded")).toBe("false");
  await act(async () => toggle(container).click());
  expect(changed).toHaveBeenCalledWith(true);
  expect(toggle(container).getAttribute("aria-expanded")).toBe("false");
});
