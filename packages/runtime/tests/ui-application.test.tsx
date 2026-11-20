// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AGENT_UI_PRESENTATION_LOCALES } from "@za38.03/agent-ui-plugins";
import { AgentApplication, createPluginCapabilityCatalog, createRuntimeCompositionStore, type AgentUIProjectOptions } from "../src/ui/index.js";
import { AgentUIProvider, useAgent, type AgentUIHost } from "../src/public.js";
import { usePluginActions } from "../src/plugin-api/index.js";
import { useAgentRuntime } from "../src/agent-context/agent-runtime-hooks.js";
import type { UIPluginActions, UIPluginDefinition } from "../src/contracts/index.js";

it("stages a replacement project composition store through the existing application mount", async () => {
  const mount = document.createElement("div");
  document.body.append(mount);
  const root = createRoot(mount);
  const store = createRuntimeCompositionStore<Record<string, unknown>>();
  const manifest = { id: "sample", name: "Sample", description: "Test presentation", version: "1.0.0" };
  const project: AgentUIProjectOptions = {
    appUIModelSource: JSON.stringify({ root: { type: "slot", plugins: [{ id: "sample", pluginId: "sample", enabled: true }] } }),
    pluginCapabilityCatalog: createPluginCapabilityCatalog([{ manifest, provides: [], inject: [], optionalInject: [], loadDefinition: async () => ({ manifest, Component: () => <div data-testid="sample">Project presentation</div> }) }]),
    capabilityCatalogRevision: "a".repeat(64), compositionStore: store,
    appFrontendTools: [], appEventSchemas: {}, baseConversationToolkit: {},
    Integrations: ({ children }) => <>{children}</>, conversationServices: {},
    getConversationStarterSuggestions: () => [],
    defaultLocale: "en-US", locales: AGENT_UI_PRESENTATION_LOCALES,
    shell: {},
  };
  try {
    await act(async () => { root.render(<AgentApplication project={project} />); });
    await act(async () => { await vi.waitFor(() => expect(store.getCandidateDiagnostic()?.status).toBe("resolved")); });
    expect(mount.querySelector('[data-testid="sample"]')).not.toBeNull();
    expect(mount.querySelector(".agent-ui-assistant-trigger, [data-agent-ui-mode]")).toBeNull();
    const replacement = createRuntimeCompositionStore<Record<string, unknown>>();
    await act(async () => { root.render(<AgentApplication project={{ ...project, compositionStore: replacement }} />); });
    await act(async () => { await vi.waitFor(() => expect(replacement.getCandidateDiagnostic()?.status).toBe("resolved")); });
    expect(mount.querySelector('[data-testid="sample"]')).not.toBeNull();
  } finally { act(() => root.unmount()); mount.remove(); }
});

it("passes Agent ctx and plugin/setup/hook send options through the complete application", async () => {
  const mount = document.createElement("div"); document.body.append(mount);
  const root = createRoot(mount);
  let host!: AgentUIHost, setupActions!: UIPluginActions, componentActions!: UIPluginActions;
  let hookActions!: import("@za38.03/agent-ui-runtime").AgentRuntimeController;
  const requests: Record<string, any>[] = [];
  const errors = vi.fn();
  const definition: UIPluginDefinition = {
    manifest: { id: "sender", name: "Sender", description: "Test sender", version: "1.0.0" },
    setup: ({ actions }) => { setupActions = actions; },
    Component: () => { componentActions = usePluginActions(); hookActions = useAgentRuntime(); return null; },
  };
  function Host() { host = useAgent(); return null; }
  const project: AgentUIProjectOptions = {
    appUIModelSource: JSON.stringify({ root: { type: "slot", plugins: [{ id: "sender", pluginId: "sender", enabled: true }] } }),
    pluginCapabilityCatalog: createPluginCapabilityCatalog([{ manifest: definition.manifest, provides: [], inject: [], optionalInject: [], loadDefinition: async () => definition }]),
    capabilityCatalogRevision: "b".repeat(64), compositionStore: createRuntimeCompositionStore(),
    appFrontendTools: [], appEventSchemas: {}, baseConversationToolkit: {},
    Integrations: ({ children }) => <>{children}</>, conversationServices: {},
    getConversationStarterSuggestions: () => [],
    defaultLocale: "en-US", locales: AGENT_UI_PRESENTATION_LOCALES, shell: {},
  };
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const input = JSON.parse(String(init.body)); requests.push(input);
    const body = [{ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
      { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId, outcome: { type: "success" } }];
    return new Response(body.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  });
  const view = (tenant: string) => <AgentUIProvider><Host /><AgentApplication project={project}
    ctx={{ tenant }} fetch={fetch} onError={errors} /></AgentUIProvider>;
  async function send(action: () => Promise<void>) {
    const count = requests.length;
    let sent!: Promise<void>;
    await act(async () => { sent = action(); void sent.catch(() => {}); });
    for (let attempt = 0; attempt < 100 && (requests.length === count || host.getSnapshot().runtime?.run.status === "running"); attempt++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    }
    expect(requests.length).toBeGreaterThan(count);
    await sent;
  }
  try {
    await act(async () => { root.render(view("one")); });
    for (let attempt = 0; attempt < 100 && host.getSnapshot().status !== "ready"; attempt++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    }
    expect(host.getSnapshot().status).toBe("ready");
    for (const [source, actions] of [["setup", setupActions], ["component", componentActions], ["hook", hookActions]] as const) {
      await send(() => actions.sendMessage(source, { ctx: { source } }));
    }
    const threadId = requests[0]!.threadId;
    await act(async () => { root.render(view("two")); });
    await send(() => host.sendMessage("updated"));
    expect(requests.map(input => input.forwardedProps.ctx)).toEqual([
      { tenant: "one", source: "setup" }, { tenant: "one", source: "component" },
      { tenant: "one", source: "hook" }, { tenant: "two" },
    ]);
    expect(requests.every(input => input.threadId === threadId)).toBe(true);
    expect(errors).not.toHaveBeenCalled();
  } finally { act(() => root.unmount()); mount.remove(); }
});
