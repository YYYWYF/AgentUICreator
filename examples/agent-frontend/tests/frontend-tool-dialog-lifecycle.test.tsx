// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAui, type AssistantRuntime, type ThreadMessage } from "@assistant-ui/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationRuntimeProvider, type ConversationThreadBinding } from "@agent-ui/runtime-conversation";
import { HttpAgent } from "@ag-ui/client";
import type { RunAgentInput } from "@ag-ui/core";
import { runMockScenario } from "../../../packages/mock-agent/src/scenario-runner";
import { frontendToolOpenDialogScenario } from "../../../packages/mock-agent/src/builtins/frontend-tool-open-dialog";
import { frontendTools as appFrontendTools } from "./fixtures/dialog/agent-contract/frontend-tools/open-demo-dialog";
import { frontendToolUIs } from "./fixtures/dialog/agent-ui/conversation/frontend-tool-uis/open-demo-dialog";
import { ConversationSurface } from "../agent-ui/conversation/ConversationSurface";
import { parseAppUIRuntimeModel } from "../framework/contracts/app-ui-runtime-model";
import { frontendToolDialogDemoPlugin } from "./fixtures/dialog/plugins/frontend-tool-dialog-demo/definition";
import { AppFrontendToolRegistry, AppFrontendToolRuntime } from "../runtime/tools";
import { PluginServiceProvider, PluginServiceRuntime, PluginServiceRuntimeContext, createPluginRegistry, UIPluginRuntime } from "../runtime/plugins";
import { DEMO_DIALOG_SERVICE, type DemoDialogService } from "./fixtures/dialog/services/demo-dialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
class ResizeObserverMock { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal("ResizeObserver", ResizeObserverMock);
const roots: Root[] = [];
const cleanups: Array<() => void> = [];
afterEach(async () => { await act(async () => { roots.splice(0).forEach(root => root.unmount()); }); cleanups.splice(0).forEach(cleanup => cleanup()); document.body.replaceChildren(); });
const actions = { sendMessage: vi.fn(async () => {}), resumeInterrupts: vi.fn(async () => {}), startNewConversation: vi.fn(async () => {}), abortRun: vi.fn() };
function model(enabled = true) {
  return parseAppUIRuntimeModel({ root: { type: "slot", id: "demo-slot", slotId: "demo-slot" }, pluginInstances: {
    demo: { id: "demo", pluginId: "frontend-tool-dialog-demo", enabled, mount: { slotId: "demo-slot" } },
  } });
}
function resolvedHistory(): ThreadMessage[] {
  return [{ id: "stored-dialog", role: "assistant", createdAt: new Date(0),
    status: { type: "complete", reason: "stop" },
    content: [{ type: "tool-call", toolCallId: "stored-call", toolName: "open_demo_dialog", args: { title: "Settings", message: "Preferences" }, argsText: '{"title":"Settings","message":"Preferences"}', result: { opened: true, title: "Settings" } }],
    metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} },
  }];
}
async function fixture(coldHistory = false) {
  const services = new PluginServiceRuntime();
  const registry = createPluginRegistry([frontendToolDialogDemoPlugin]);
  services.reconcile(model(), registry, actions);
  const dialog = services.get<DemoDialogService>(DEMO_DIALOG_SERVICE)!;
  const open = vi.spyOn(dialog, "open");
  const source = new AppFrontendToolRuntime(new AppFrontendToolRegistry(appFrontendTools));
  const disconnect = source.connectServices(services.services, services.subscribe);
  const execute = vi.spyOn(source, "execute");
  cleanups.push(() => { disconnect(); services.dispose(); });
  let current = coldHistory ? "history" : "live";
  const threadList = { threads: ["live", "history", "other"].map(id => ({ id, status: "regular" as const })), archivedThreads: [] };
  const binding: ConversationThreadBinding = {
    getThreadId: () => current,
    subscribe: () => () => {},
    getThreadListSnapshot: () => threadList,
    activateThread: id => { current = id; },
    createNewThread: async () => "new",
    loadThread: async id => ({ messages: id === "history" ? resolvedHistory() : [] }),
  };
  let runtime!: AssistantRuntime;
  function Capture() { runtime = useAui().threads.__internal_getAssistantRuntime!(); return null; }
  const inputs: RunAgentInput[] = [];
  const agents: HttpAgent[] = [];
  const agentFactory = ({ threadId }: { threadId: string }) => {
    const agent = new HttpAgent({ url: "http://example.test/agent", threadId, fetch: async (_url, init) => {
      const input = JSON.parse(String(init.body)) as RunAgentInput;
      inputs.push(input);
      const encoder = new TextEncoder();
      const scenario = { ...frontendToolOpenDialogScenario, initialState: { progress: 0 }, steps: [
        ...frontendToolOpenDialogScenario.steps,
        { type: "message" as const, text: "Preparing dialog" },
        { type: "state-delta" as const, delta: [{ op: "replace" as const, path: "/progress", value: 1 }] },
      ] };
      const body = new ReadableStream<Uint8Array>({ async start(controller) {
        try {
          for await (const event of runMockScenario(input, scenario, { timingScale: 0 })) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          controller.close();
        } catch (error) { controller.error(error); }
      } });
      return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
    } });
    vi.spyOn(agent, "runAgent"); agents.push(agent); return agent;
  };
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  await act(async () => { root.render(<StrictMode>
    <ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding} frontendTools={source} frontendToolUIs={frontendToolUIs} unstable_agentFactory={agentFactory}>
      <PluginServiceRuntimeContext.Provider value={services}>
        <Capture />
        <ConversationSurface />
        <UIPluginRuntime model={model()} registry={registry} actions={actions} />
      </PluginServiceRuntimeContext.Provider>
    </ConversationRuntimeProvider>
  </StrictMode>); await tick(); });
  return { runtime, dialog, open, execute, inputs, agents, container, services, source, registry };
}
async function mountProviderFixture({ enabled = true, history = false } = {}) {
  const source = new AppFrontendToolRuntime(new AppFrontendToolRegistry(appFrontendTools));
  const availabilityReads = vi.spyOn(source, "listTools");
  const execute = vi.spyOn(source, "execute");
  const registry = createPluginRegistry([frontendToolDialogDemoPlugin]);
  const activeModel = model();
  const inactiveModel = model(false);
  const threadId = history ? "history" : "live";
  const threadList = { threads: [{ id: threadId, status: "regular" as const }], archivedThreads: [] };
  const binding: ConversationThreadBinding = {
    getThreadId: () => threadId,
    subscribe: () => () => {},
    getThreadListSnapshot: () => threadList,
    createNewThread: async () => "new",
    loadThread: async () => ({ messages: history ? resolvedHistory() : [] }),
  };
  let runtime!: AssistantRuntime;
  function Capture() { runtime = useAui().threads.__internal_getAssistantRuntime!(); return null; }
  const inputs: RunAgentInput[] = [];
  const agentFactory = ({ threadId }: { threadId: string }) => new HttpAgent({
    url: "http://example.test/agent", threadId,
    fetch: async (_url, init) => {
      const input = JSON.parse(String(init.body)) as RunAgentInput;
      inputs.push(input);
      const messageId = `${input.runId}:response`;
      const events = [
        { type: "RUN_STARTED", threadId, runId: input.runId },
        { type: "TEXT_MESSAGE_START", messageId, role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId, delta: "Ready" },
        { type: "TEXT_MESSAGE_END", messageId },
        { type: "RUN_FINISHED", threadId, runId: input.runId },
      ];
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
    },
  });
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  const render = async (providerEnabled: boolean) => {
    const currentModel = providerEnabled ? activeModel : inactiveModel;
    await act(async () => { root.render(<StrictMode>
      <ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding} frontendTools={source} frontendToolUIs={frontendToolUIs} unstable_agentFactory={agentFactory}>
        <PluginServiceProvider model={currentModel} registry={registry} actions={actions} frontendTools={source}>
          <Capture />
          <ConversationSurface />
          <UIPluginRuntime model={currentModel} registry={registry} actions={actions} />
        </PluginServiceProvider>
      </ConversationRuntimeProvider>
    </StrictMode>); await tick(); });
  };
  await render(enabled);
  return { source, availabilityReads, execute, container, inputs, render, get runtime() { return runtime; } };
}
async function tick() { await new Promise<void>(resolve => setTimeout(resolve, 0)); }
async function settle(predicate: () => boolean) {
  for (let index = 0; index < 100; index++) { if (predicate()) return; await act(async () => { await tick(); }); }
  throw new Error("Timed out awaiting native frontend tool pipeline");
}
describe("dialog frontend tool native lifecycle", () => {
  it("starts unavailable and advertises the tool after the real child Service Provider mounts", async () => {
    const f = await mountProviderFixture();
    // The adapter's first render sees no Services; only the real Provider may
    // connect/reconcile them. No capability is prepared before mount.
    expect(f.availabilityReads.mock.results[0]!.value).toEqual([]);
    await settle(() => f.source.listTools().some(tool => tool.name === "open_demo_dialog"));
    expect(f.source.getRevision()).toBeGreaterThan(0);
    await act(async () => { f.runtime.thread.append({ role: "user", content: [{ type: "text", text: "first request" }], startRun: true }); await tick(); });
    await settle(() => f.inputs.length === 1 && !f.runtime.thread.getState().isRunning);
    expect(f.inputs[0]!.tools.some(tool => tool.name === "open_demo_dialog")).toBe(true);
    await f.render(false);
    expect(f.source.listTools()).toEqual([]);
    await act(async () => { f.runtime.thread.append({ role: "user", content: [{ type: "text", text: "next request" }], startRun: true }); await tick(); });
    await settle(() => f.inputs.length === 2 && !f.runtime.thread.getState().isRunning);
    expect(f.inputs[1]!.tools.some(tool => tool.name === "open_demo_dialog")).toBe(false);
  });
  it("renders specialized cold history without capability or model advertisement", async () => {
    const f = await mountProviderFixture({ enabled: false, history: true });
    await settle(() => f.container.querySelector('[data-frontend-tool="open_demo_dialog"]') !== null);
    expect(f.container.textContent).toContain("Settings");
    expect(f.source.listTools()).toEqual([]);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.inputs).toHaveLength(0);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("executes once, sends result on continuation, and never reopens on thread revisit", async () => {
    const f = await fixture();
    await act(async () => { f.runtime.thread.append({ role: "user", content: [{ type: "text", text: "帮我打开设置弹窗" }], startRun: true }); await tick(); });
    await settle(() => f.inputs.length === 2 && !f.runtime.thread.getState().isRunning);
    expect(f.inputs[0]!.tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: "open_demo_dialog" })]));
    expect(f.open).toHaveBeenCalledTimes(1);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.dialog.getSnapshot().open).toBe(true);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    const result = f.inputs[1]!.messages.find(message => message.role === "tool");
    expect(result).toMatchObject({ role: "tool", content: expect.stringContaining('"opened":true') });
    expect(f.container.textContent).toContain("Settings");
    await act(async () => { f.dialog.close(); await f.runtime.threads.switchToThread("other"); });
    await act(async () => { await f.runtime.threads.switchToThread("live"); });
    expect(f.container.querySelector('[data-frontend-tool="open_demo_dialog"]')).not.toBeNull();
    expect(f.dialog.getSnapshot().open).toBe(false);
    expect(f.open).toHaveBeenCalledTimes(1);
    expect(f.inputs).toHaveLength(2);
  });
  it("loads resolved history and remounts under StrictMode without executing or running Agent", async () => {
    const f = await fixture(true);
    await settle(() => f.container.querySelector('[data-frontend-tool="open_demo_dialog"]') !== null);
    expect(f.container.textContent).toContain("Settings");
    expect(f.runtime.thread.getState().messages[0]!.content[0]).toMatchObject({ type: "tool-call", result: { opened: true, title: "Settings" } });
    await act(async () => { await f.runtime.threads.switchToThread("other"); });
    await act(async () => { await f.runtime.threads.switchToThread("history"); });
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.open).not.toHaveBeenCalled();
    expect(f.dialog.getSnapshot().open).toBe(false);
    f.agents.forEach(agent => expect(agent.runAgent).not.toHaveBeenCalled());
  });
  it("updates the model-visible tools when the provider deactivates", async () => {
    const f = await fixture();
    await act(async () => { f.services.reconcile(model(false), f.registry, actions); });
    expect(f.source.listTools()).toEqual([]);
    await act(async () => { f.runtime.thread.append({ role: "user", content: [{ type: "text", text: "open settings" }], startRun: true }); await tick(); });
    await settle(() => f.inputs.length > 0 && !f.runtime.thread.getState().isRunning);
    expect(f.inputs[0]!.tools.some(tool => tool.name === "open_demo_dialog")).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
  });
});
