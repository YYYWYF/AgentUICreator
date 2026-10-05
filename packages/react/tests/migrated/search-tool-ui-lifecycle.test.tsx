// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { HttpAgent } from "@ag-ui/client";
import { EventType, type RunAgentInput } from "@ag-ui/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationRuntimeProvider, type ConversationThreadBinding } from "@agent-ui/runtime-conversation";
import type { ConversationToolkit } from "@agent-ui/react";
import { runMockScenario } from "../../../mock-agent/src/scenario-runner";
import { webSearchScenario } from "../../../mock-agent/src/builtins/web-search";
import { retrievalChunksScenario } from "../../../mock-agent/src/builtins/retrieval-chunks";
import type { MockScenario } from "../../../mock-agent/src/scenario";
import webSearchPlugin from "../../../source-registry/registry/items/plugin-web-search/files/plugins/web-search/definition";
import retrievalPlugin from "../../../source-registry/registry/items/plugin-retrieval-chunks/files/plugins/retrieval-chunks/definition";
import { ConversationSurface } from "../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/conversation/ConversationSurface";
import { buildRuntimeComposition } from "../../../source-registry/registry/items/foundation-core-runtime/files/runtime/composition/RuntimeCompositionBuilder";
import { createPluginCapabilityCatalog } from "../../../source-registry/registry/items/foundation-core-runtime/files/runtime/composition/PluginCapabilityCatalog";
import { PluginServiceRuntime, PluginServiceRuntimeContext } from "../../../source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/index";

const plugins = [webSearchPlugin, retrievalPlugin];
const catalog = createPluginCapabilityCatalog(plugins.map(p => ({
  manifest: p.manifest, provides: [], inject: [], optionalInject: [], loadDefinition: async () => p,
})));
const roots: Root[] = [];
const cleanups: Array<() => void> = [];
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
afterEach(async () => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  await act(async () => roots.splice(0).forEach(root => root.unmount()));
  document.body.replaceChildren();
});
async function toolkit(removed?: string, disabled?: string) {
  const composition = await buildRuntimeComposition({
    appUIModelSource: JSON.stringify({
      applicationPlugins: plugins.filter(p => p.manifest.id !== removed).map(p => ({
        id: p.manifest.id, pluginId: p.manifest.id, enabled: p.manifest.id !== disabled,
      })),
      root: { type: "slot", plugins: [] },
    }),
    capabilityCatalog: catalog,
    capabilityCatalogRevision: "a".repeat(64),
  });
  return composition.conversationToolkit;
}
async function fixture(scenario: MockScenario, pauseResult = false) {
  let runtime!: AssistantRuntime;
  function Capture() { runtime = useAui().threads.__internal_getAssistantRuntime!(); return null; }
  let release!: () => void;
  const resultGate = new Promise<void>(resolve => { release = resolve; });
  cleanups.push(release);
  const events: EventType[] = [];
  const factory = ({ threadId }: { threadId: string }) => new HttpAgent({
    url: "http://example.test/agent", threadId,
    fetch: async (_url, init) => {
      const input = JSON.parse(String(init.body)) as RunAgentInput;
      const body = new ReadableStream<Uint8Array>({ async start(controller) {
        try {
          for await (const event of runMockScenario(input, scenario, { timingScale: 0 })) {
            if (pauseResult && event.type === EventType.TOOL_CALL_RESULT) await resultGate;
            events.push(event.type);
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
          }
          controller.close();
        } catch (error) { controller.error(error); }
      } });
      return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
    },
  });
  const threadList = { threads: [{ id: "live", status: "regular" as const }], archivedThreads: [] };
  const binding: ConversationThreadBinding = {
    getThreadId: () => "live", subscribe: () => () => {}, getThreadListSnapshot: () => threadList,
    activateThread: () => {}, createNewThread: async () => "live", loadThread: async () => ({ messages: [] }),
  };
  const services = new PluginServiceRuntime();
  cleanups.push(() => services.dispose());
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  async function render(toolkit: ConversationToolkit) {
    await act(async () => {
      root.render(<ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding} unstable_agentFactory={factory} toolkit={toolkit}>
        <PluginServiceRuntimeContext.Provider value={services}><Capture /><ConversationSurface /></PluginServiceRuntimeContext.Provider>
      </ConversationRuntimeProvider>);
    });
  }
  await render(await toolkit());
  async function send() {
    await act(async () => { runtime.thread.append({ role: "user", content: [{ type: "text", text: "Search" }] }); });
  }
  async function complete() {
    release();
    await act(async () => {
      await vi.waitFor(() => {
        expect(runtime.thread.getState().isRunning).toBe(false);
        expect(events).toContain(EventType.TOOL_CALL_RESULT);
      });
    });
  }
  return { container, send, complete, render, events };
}

const cases = [
  { scenario: webSearchScenario, id: "web-search", slot: "web-search", active: "正在搜索", completed: "已读取 2 个来源" },
  { scenario: retrievalChunksScenario, id: "retrieval-chunks", slot: "retrieval-chunks", active: "正在检索", completed: "已检索 1 个片段" },
];
describe("standard AG-UI search Tool UI lifecycle", () => {
  it.each(cases)("$id renders running then completed results through Tools", async c => {
    const f = await fixture(c.scenario, true);
    await f.send();
    await act(async () => { await vi.waitFor(() => expect(f.container.textContent).toContain(c.active)); });
    expect(f.container.querySelector(`[data-slot="${c.slot}"]`)).not.toBeNull();
    expect(f.container.querySelector('[data-slot="tool-fallback-root"]')).toBeNull();
    await f.complete();
    expect(f.container.textContent).toContain(c.completed);
    if (c.id === "web-search") {
      for (const text of ["assistant-ui", "assistant-ui.com", "AG-UI", "docs.ag-ui.com"]) expect(f.container.textContent).toContain(text);
    } else {
      for (const text of ["policy.pdf", "p.14", "0.91", "退款申请需在30天内提交。"]) expect(f.container.textContent).toContain(text);
      expect(f.container.querySelector('[role="meter"]')?.getAttribute("aria-label")).toBe("policy.pdf 相关度");
      expect(f.container.querySelector('[role="meter"]')?.getAttribute("aria-valuetext")).toBe("0.91，满分 1.00");
    }
    expect(f.events).not.toContain(EventType.CUSTOM);
    expect(f.events.filter(type => type.startsWith("TOOL_CALL_"))).toEqual([
      EventType.TOOL_CALL_START, EventType.TOOL_CALL_ARGS, EventType.TOOL_CALL_END, EventType.TOOL_CALL_RESULT,
    ]);
  });

  it.each(cases)("$id falls back for malformed completion and accepts empty results", async c => {
    const makeScenario = (result: unknown): MockScenario => ({ ...c.scenario,
      steps: c.scenario.steps.map(step => step.type === "tool" ? { ...step, result } : step),
    });
    const malformed = await fixture(makeScenario(c.id === "web-search" ? { results: [{ title: 7 }] } : { chunks: [{ score: "invalid" }] }));
    await malformed.send(); await malformed.complete();
    expect(malformed.container.querySelector('[data-slot="tool-fallback-root"]')).not.toBeNull();
    expect(malformed.container.querySelector(`[data-slot="${c.slot}"]`)).toBeNull();
    const empty = await fixture(makeScenario(c.id === "web-search" ? { results: [] } : { chunks: [] }));
    await empty.send(); await empty.complete();
    expect(empty.container.querySelector(`[data-slot="${c.slot}"]`)).not.toBeNull();
    expect(empty.container.textContent).toContain(c.id === "web-search" ? "已读取 0 个来源" : "已检索 0 个片段");
    expect(empty.container.querySelector('[data-slot="tool-fallback-root"]')).toBeNull();
  });

  it.each(cases)("disabling or removing $id reroutes the same Mock while the other plugin stays registered", async c => {
    const scene = { ...c.scenario, steps: [...webSearchScenario.steps, ...retrievalChunksScenario.steps] };
    const f = await fixture(scene);
    await f.send(); await f.complete();
    expect(f.container.querySelector('[data-slot="web-search"]')).not.toBeNull();
    expect(f.container.querySelector('[data-slot="retrieval-chunks"]')).not.toBeNull();
    const otherSlot = c.id === "web-search" ? "retrieval-chunks" : "web-search";
    for (const changed of [await toolkit(undefined, c.id), await toolkit(c.id)]) {
      await f.render(changed);
      await act(async () => { await vi.waitFor(() => {
        expect(f.container.querySelector(`[data-slot="${c.slot}"]`)).toBeNull();
        expect(f.container.querySelector('[data-slot="tool-fallback-root"]')).not.toBeNull();
        expect(f.container.querySelector(`[data-slot="${otherSlot}"]`)).not.toBeNull();
      }); });
    }
    await f.render(await toolkit());
    expect(f.container.querySelector(`[data-slot="${c.slot}"]`)).not.toBeNull();
    expect(f.container.querySelector('[data-slot="tool-fallback-root"]')).toBeNull();
  });
});
