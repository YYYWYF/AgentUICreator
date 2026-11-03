// @vitest-environment jsdom
import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime, useAssistantToolUI } from "@assistant-ui/react";
import { HttpAgent } from "@ag-ui/client";
import { useAgUiRuntime, type AgUiAssistantRuntime } from "@assistant-ui/react-ag-ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentUILocaleProvider, ConversationThread, ConversationToolResult, ConversationToolResultContent, ConversationToolTimeline, ConversationDefaultTool, ConversationTaskGroup } from "../src/public.js";
import { projectToolTimeline } from "../src/internal/tool-timeline-projection.js";
import { hasToolResultParts } from "../src/plugins/tool-result/adapters/presentation/content.js";
import definition, { ConversationToolResultPlugin as PackagePlugin } from "../dist/tool-result/index.js";
import { ConversationToolResultPlugin as PortablePlugin } from "../dist/sources/takeover/tool-result/index";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value() {} });
const roots: Root[] = [];
afterEach(async () => { await act(async () => roots.splice(0).forEach(root => root.unmount())); document.body.replaceChildren(); });
async function mount(node: ReactNode) { const el = document.createElement("div"); document.body.append(el); const root = createRoot(el); roots.push(root); await act(async () => root.render(<AgentUILocaleProvider locale="zh-CN">{node}</AgentUILocaleProvider>)); return { el, root }; }
const parts = [
  { type: "text", text: "Tool output" },
  { type: "image", source: { type: "url", value: "https://example.test/chart.png", mimeType: "image/png" } },
  { type: "audio", source: { type: "url", value: "https://example.test/audio.wav", mimeType: "audio/wav" } },
  { type: "video", source: { type: "url", value: "https://example.test/video.webm", mimeType: "video/webm" } },
  { type: "document", source: { type: "data", value: "JVBERi0xLjQK", mimeType: "application/pdf" }, metadata: { filename: "报告.pdf" } },
];
describe("tool result content", () => {
  it("renders mixed parts in order using the existing image, media players and file download", async () => {
    const { el } = await mount(<ConversationToolResultContent result={parts} />);
    expect([...el.querySelectorAll("[data-content-type]")].map(node => node.getAttribute("data-content-type"))).toEqual(parts.map(part => part.type));
    expect(el.querySelector("img")?.src).toBe("https://example.test/chart.png");
    expect(el.querySelector("audio")?.src).toBe("https://example.test/audio.wav");
    expect(el.querySelector("video")?.src).toBe("https://example.test/video.webm");
    expect(el.querySelector("audio")?.autoplay).toBe(false);
    expect(el.querySelector('[data-content-type="audio"] a')).toBeNull();
    expect(el.querySelector('[data-content-type="video"] a')).toBeNull();
    expect(el.querySelector("video")?.getAttribute("controlslist")).toBe("nodownload");
    expect(el.querySelector('[download="报告.pdf"]')?.getAttribute("download")).toBe("报告.pdf");
    expect(el.querySelector<HTMLAnchorElement>('[download="报告.pdf"]')?.href).toBe("data:application/pdf;base64,JVBERi0xLjQK");
    expect(el.querySelector("[data-slot=tool-fallback-result]")).toBeNull();
  });
  it("keeps ordinary business JSON and malformed parts in the original result fallback", async () => {
    for (const result of [{ answer: 42 }, [{ type: "image", source: null }], [{ type: "text", text: 42 }], []]) {
      expect(hasToolResultParts(result)).toBe(false);
      const { el } = await mount(<ConversationToolResultContent result={result} />);
      expect(el.querySelector("pre")?.textContent).toBe(JSON.stringify(result, null, 2));
    }
  });
  it.each(["javascript:alert(1)", "file:///C:/private.png", "data:text/html,<script>alert(1)</script>"])("does not load unsafe URL %s", async value => {
    const { el } = await mount(<ConversationToolResultContent result={[{ type: "image", source: { type: "url", value } }]} />);
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector("[role=status]")?.textContent).toContain("暂时无法预览");
  });
  it("resolves provider file handles without fetching or interpreting the handle and aborts on unmount", async () => {
    let signal!: AbortSignal;
    const resolveFile = vi.fn(async (source, options) => { signal = options.signal; expect(source.value).toBe("opaque:file-1"); return "https://example.test/resolved.png"; });
    const { el, root } = await mount(<ConversationToolResultContent result={[{ type: "image", source: { type: "file", value: "opaque:file-1", provider: "example" } }]} resolveFile={resolveFile} />);
    expect(el.querySelector("img")?.src).toBe("https://example.test/resolved.png");
    await act(async () => root.render(null)); expect(signal.aborted).toBe(true);
  });
  it("ignores stale resolver completion after the source changes", async () => {
    let finish!: (url: string) => void;
    const resolveFile = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    const { el, root } = await mount(<ConversationToolResultContent result={[{ type: "image", source: { type: "file", value: "first" } }]} resolveFile={resolveFile} />);
    await act(async () => root.render(<ConversationToolResultContent result={[{ type: "text", text: "replacement" }]} />));
    await act(async () => finish("https://example.test/stale.png"));
    expect(el.querySelector("img")).toBeNull(); expect(el.textContent).toBe("replacement");
  });
  it("stops using a resolved file URL when the resolver is removed", async () => {
    const result = [{ type: "image", source: { type: "file", value: "provider-file" } }];
    const { el, root } = await mount(<ConversationToolResultContent result={result} resolveFile={() => "https://example.test/resolved.png"} />);
    expect(el.querySelector("img")).not.toBeNull();
    await act(async () => root.render(<ConversationToolResultContent result={result} />));
    expect(el.querySelector("img")).toBeNull(); expect(el.querySelector("[role=status]")).not.toBeNull();
  });
  it("offers presentation overrides without changing stored content", async () => {
    const renderPart = vi.fn((part, index, content) => index === 0 ? <b>{part.text}</b> : content);
    const { el } = await mount(<ConversationToolResultContent result={parts} renderPart={renderPart} />);
    expect(el.querySelector("b")?.textContent).toBe("Tool output"); expect(renderPart).toHaveBeenCalledTimes(5);
  });
});
const tool = { type: "tool-call" as const, toolCallId: "call", toolName: "media", args: {}, argsText: "{}", result: parts };
function Registration({ custom = false }: { custom?: boolean }) {
  useAssistantToolUI({ toolName: "media", render: custom ? () => <div data-custom-tool="">Custom tool UI</div> : ConversationDefaultTool });
  return null;
}
function Thread({ enabled = true, named = false, custom = false, task = false }: { enabled?: boolean; named?: boolean; custom?: boolean; task?: boolean }) {
  const runtime = useLocalRuntime({ async *run() {} }, { initialMessages: [{ role: "assistant", content: [task ? { ...tool, messages: [] } : tool] }] });
  return <AssistantRuntimeProvider runtime={runtime}>{named && <Registration custom={custom} />}<ConversationThread composer={null} components={{ ...(enabled ? { ToolFallback: ConversationToolResult } : {}), ToolTimeline: ConversationToolTimeline, ...(task ? { TaskGroup: ConversationTaskGroup } : {}) }} /></AssistantRuntimeProvider>;
}
it("keeps content visible outside timeline summaries and disables cleanly", async () => {
  expect(projectToolTimeline([{ ...tool, status: { type: "complete" } }]).calls[0]?.protected).toBe(true);
  const { el, root } = await mount(<Thread />);
  expect(el.querySelector("[data-slot=tool-timeline]")).not.toBeNull(); expect(el.querySelector("audio")).not.toBeNull();
  await act(async () => root.render(<Thread enabled={false} />));
  expect(el.querySelector("audio")).toBeNull();
});
it("uses the same renderer for task results", async () => {
  const { el } = await mount(<Thread task />);
  expect(el.querySelector("[data-slot=tool-result-content]")).not.toBeNull();
  expect(el.querySelector("audio")).not.toBeNull();
});
it("renders media inside an expanded readonly task transcript", async () => {
  function Host() {
    const nested = { id: "worker", role: "assistant" as const, content: [tool], status: { type: "complete" as const, reason: "stop" as const }, createdAt: new Date(0), metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} } };
    const runtime = useLocalRuntime({ async *run() {} }, { initialMessages: [{ role: "assistant", content: [{ ...tool, toolCallId: "parent", toolName: "delegate", result: undefined, messages: [nested] }] }] });
    return <AssistantRuntimeProvider runtime={runtime}><ConversationThread composer={null} components={{ ToolFallback: ConversationToolResult, TaskGroup: ConversationTaskGroup }} /></AssistantRuntimeProvider>;
  }
  const { el } = await mount(<Host />);
  await act(async () => el.querySelector<HTMLButtonElement>('[data-slot="task-card"] > button')!.click());
  expect(el.querySelector('[data-slot="task-card-transcript"] audio')).not.toBeNull();
});
it("retains approval actions and their callback while showing typed results", async () => {
  const respond = vi.fn().mockResolvedValue(undefined);
  function Host() { const runtime = useLocalRuntime({ async *run() {} }); return <AssistantRuntimeProvider runtime={runtime}><ConversationToolResult {...tool} status={{ type: "requires-action", reason: "tool-calls" }} approval={{ id: "approve" }} respondToApproval={respond} /></AssistantRuntimeProvider>; }
  const { el } = await mount(<Host />);
  expect(el.querySelector("audio")).not.toBeNull();
  const approve = [...el.querySelectorAll("button")].find(button => button.textContent === "允许");
  expect(approve).toBeDefined(); await act(async () => approve!.click());
  expect(respond).toHaveBeenCalledWith({ approved: true });
});
it("default frontend-tool renderers follow plugin selection while named custom UI wins", async () => {
  const { el, root } = await mount(<Thread named />);
  expect(el.querySelectorAll("audio")).toHaveLength(1);
  await act(async () => root.render(<Thread named custom />));
  expect(el.querySelector("[data-custom-tool]")).not.toBeNull(); expect(el.querySelector("audio")).toBeNull();
});
it.each([{ name: "npm", Plugin: PackagePlugin }, { name: "portable source", Plugin: PortablePlugin }])("$name plugin forwards the scoped tool and application props", async ({ Plugin }) => {
  expect(definition.manifest.id).toBe("tool-result"); expect(definition.toolkit).toBeUndefined();
  function Host() { const runtime = useLocalRuntime({ async *run() {} }); return <AssistantRuntimeProvider runtime={runtime}><Plugin renderSlot={() => null} renderScopedSlot={() => null} tool={{ ...tool, status: { type: "complete" } }} renderPart={(part, index, content) => index === 0 ? <strong>{part.type}</strong> : content} /></AssistantRuntimeProvider>; }
  const { el } = await mount(<Host />);
  expect(el.querySelector("strong")?.textContent).toBe("text"); expect(el.querySelector("audio")).not.toBeNull();
});
it.each(["live", "snapshot"])("renders actual HttpAgent %s events through the official AG-UI runtime", async mode => {
  let runtime!: AgUiAssistantRuntime;
  const agent = new HttpAgent({ url: "https://example.test/agent", fetch: async (_url, init) => {
    const input = JSON.parse(String(init.body));
    const events = [
      { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
      ...(mode === "snapshot" ? [{ type: "MESSAGES_SNAPSHOT", messages: [
        { id: "a", role: "assistant", content: "", toolCalls: [{ id: "call", type: "function", function: { name: "media", arguments: "{}" } }] },
        { id: "t", role: "tool", toolCallId: "call", content: parts },
      ] }] : [
        { type: "TEXT_MESSAGE_START", messageId: "a", role: "assistant" }, { type: "TEXT_MESSAGE_END", messageId: "a" },
        { type: "TOOL_CALL_START", toolCallId: "call", toolCallName: "media", parentMessageId: "a" },
        { type: "TOOL_CALL_ARGS", toolCallId: "call", delta: "{}" }, { type: "TOOL_CALL_END", toolCallId: "call" },
        { type: "TOOL_CALL_RESULT", messageId: "t", toolCallId: "call", content: parts },
      ]),
      { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId, outcome: { type: "success" } },
    ];
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  } });
  function Host() { const current = useAgUiRuntime({ agent }); useEffect(() => { runtime = current; }, [current]); return <AssistantRuntimeProvider runtime={current}><ConversationThread composer={null} components={{ ToolFallback: ConversationToolResult, ToolTimeline: ConversationToolTimeline }} /></AssistantRuntimeProvider>; }
  const { el } = await mount(<Host />);
  await act(async () => { runtime.thread.append("Generate media"); });
  for (let i = 0; i < 100 && !el.querySelector("audio"); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  expect(el.querySelector("audio")).not.toBeNull(); expect(el.querySelectorAll("[data-slot=tool-result-part]")).toHaveLength(5);
  const result = runtime.thread.getState().messages.flatMap(message => message.role === "assistant" ? message.content : []).find(part => part.type === "tool-call");
  expect(result).toMatchObject({ result: parts });
});
