// @vitest-environment jsdom
import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ComposerPrimitive, useAui, type AssistantClient } from "@assistant-ui/react";
import { afterEach, expect, it, vi } from "vitest";
import { createDefaultAgentUIPresentation, ConversationComposerSend, usePluginService, type UIPluginDefinition } from "@za38.03/agent-ui-plugins";
import { AgentApplication, AgentUIApplication, AgentUICompatibilityRoot, AgentUIProjectProvider, createAgentUIProject, createPluginCapabilityCatalog } from "../src/ui/index.js";
import { AgentUIProvider, useAgentUIAgents, useAgentUIAgentIdentity, type AgentUIAgents } from "../src/host/AgentUIAgentsProvider.js";
import { getPreviewAgentEnvironment } from "../src/ui/application/preview-environment.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.unstubAllGlobals(); delete window.__agentUIPreviewEnvironment; delete window.__agentUIPreviewEnvironmentReady; });

it.each(["controlled", "always", "web-component", "workflow", "single", "preview-workflow"] as const)("keeps independent application services and DOM mounted while buttons send without creating Threads or selecting an Agent (%s)", async mode => {
  const workflow = ["workflow", "single", "preview-workflow"].includes(mode);
  const single = mode === "single";
  if (mode === "preview-workflow") window.__agentUIPreviewEnvironment = { agentId: "a", identity: "mock-a", runtimeEndpoint: "/mock" };
  let setVisible!: (id: string) => void;
  let agents!: AgentUIAgents;
  const clients = new Map<string, AssistantClient>();
  const started = vi.fn(), stopped = vi.fn(), mounted = vi.fn();
  const requests: { url: string; body: Record<string, any> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    const body = JSON.parse(String(init.body)); requests.push({ url: String(url), body });
    return new Response([
      { type: "RUN_STARTED", threadId: body.threadId, runId: body.runId },
      { type: "TEXT_MESSAGE_START", messageId: body.runId, role: "assistant" },
      { type: "TEXT_MESSAGE_CONTENT", messageId: body.runId, delta: "done" },
      { type: "TEXT_MESSAGE_END", messageId: body.runId },
      { type: "RUN_FINISHED", threadId: body.threadId, runId: body.runId },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  }));
  function View() {
    const id = useAgentUIAgentIdentity()?.agentId ?? "a";
    const client = useAui(); clients.set(id, client);
    const service = usePluginService<string>("test.identity");
    useEffect(() => { mounted(id); }, [id]);
    return <ComposerPrimitive.Root><output>{service}</output><ComposerPrimitive.Input aria-label={id} />
      <ConversationComposerSend {...(workflow ? { endpoint: "/api/orders" } : {})} data-testid={`send-${id}`} />
      {workflow && <><ConversationComposerSend endpoint="/api/refund" data-testid="refund" /><ConversationComposerSend data-testid="default" /></>}
    </ComposerPrimitive.Root>;
  }
  const provider: UIPluginDefinition = { manifest: { id: "identity", name: "Identity", description: "Test", version: "1.0.0", capabilities: ["headless"] },
    provides: ["test.identity"], Component: () => null, setup: ({ services, application }) => { started(application?.agentId ?? "a"); services.provide("test.identity", application?.agentId ?? "a"); return () => stopped(application?.agentId ?? "a"); } };
  const view: UIPluginDefinition = { manifest: { id: "view", name: "View", description: "Test", version: "1.0.0" }, inject: ["test.identity"], Component: View };
  const project = createAgentUIProject({ development: mode === "preview-workflow", presentation: createDefaultAgentUIPresentation(),
    appUIModelSource: JSON.stringify({ applicationPlugins: [{ pluginId: "identity", enabled: true }], root: { type: "slot", plugins: [{ pluginId: "view" }] } }),
    pluginCapabilityCatalog: createPluginCapabilityCatalog([provider, view].map(definition => ({ ...definition, provides: definition.provides ?? [], inject: definition.inject ?? [], optionalInject: [], loadDefinition: async () => definition }))), capabilityCatalogRevision: "a".repeat(64) });
  function Controls() { agents = useAgentUIAgents(); return null; }
  function Scene() {
    const [visible, select] = useState("a"); setVisible = select;
    if (single) return <div data-agent-ui-agent="a"><AgentApplication project={project} endpoint="/api/a" /></div>;
    return mode === "web-component" ?
      <AgentUIProjectProvider value={project}><AgentUICompatibilityRoot config={{ endpoint: "/agent", locale: "zh-CN", agents: [
        { agentId: "a", endpoint: "/api/a", hidden: visible !== "a" }, { agentId: "b", endpoint: "/api/b", hidden: visible !== "b" },
      ] }} emit={() => {}} onAgents={value => { if (value) agents = value; }} /></AgentUIProjectProvider>
      : <AgentUIProvider><Controls />
        <AgentUIApplication agentId="a" endpoint="/api/a" project={project} hidden={mode !== "always" && visible !== "a"} />
        <AgentUIApplication agentId="b" endpoint="/api/b" project={project} hidden={mode !== "always" && visible !== "b"} />
      </AgentUIProvider>;
  }
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => { root.render(<Scene />); });
    await act(async () => { await vi.waitFor(() => expect(container.querySelectorAll("textarea")).toHaveLength(single ? 1 : 2)); });
    const a = container.querySelector<HTMLDivElement>('div[data-agent-ui-agent="a"]')!;
    const b = container.querySelector<HTMLDivElement>('div[data-agent-ui-agent="b"]')!;
    const textarea = a.querySelector("textarea");
    expect(a.hidden).toBe(false); if (b) expect(b.hidden).toBe(mode !== "always");
    expect([...container.querySelectorAll("output")].map(node => node.textContent)).toEqual(single ? ["a"] : ["a", "b"]);
    await act(async () => clients.get("a")!.composer.setText("send to writer"));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="send-a"]')!.click());
    await act(async () => { await vi.waitFor(() => expect(requests).toHaveLength(1)); });
    expect(requests[0]!.url).toBe(mode === "preview-workflow" ? "/mock" : workflow ? "/api/orders" : "/api/a");
    expect(requests[0]!.body.messages).toMatchObject([{ content: "send to writer" }]);
    expect(a.hidden).toBe(false); if (b) expect(b.hidden).toBe(mode !== "always");
    if (workflow) {
      for (const [index, button] of ["refund", "default"].entries()) {
        await act(async () => clients.get("a")!.composer.setText(`follow-up-${index}`));
        await act(async () => container.querySelector<HTMLButtonElement>(`[data-testid="${button}"]`)!.click());
        await act(async () => { await vi.waitFor(() => expect(requests).toHaveLength(index + 2)); });
        expect(requests[index + 1]!.url).toBe(mode === "preview-workflow" ? "/mock" : index === 0 ? "/api/refund" : "/api/a");
        expect(requests[index + 1]!.body.threadId).toBe(requests[0]!.body.threadId);
      }
    }
    if (!single) {
      const ids = agents.getSnapshot().agents.map(agent => agent.connection.runtime?.conversation.id);
      await act(async () => setVisible("b"));
      expect(a.hidden).toBe(mode !== "always"); expect(b.hidden).toBe(false);
      await act(async () => setVisible("a"));
      expect(agents.getSnapshot().agents.map(agent => agent.connection.runtime?.conversation.id)).toEqual(ids);
    }
    expect(a.querySelector("textarea")).toBe(textarea);
    expect(started).toHaveBeenCalledTimes(single ? 1 : 2); expect(stopped).not.toHaveBeenCalled();
    expect(mounted).toHaveBeenCalledTimes(single ? 1 : 2);
  } finally { await act(async () => root.unmount()); container.remove(); }
  expect(stopped).toHaveBeenCalledTimes(single ? 1 : 2);
});

it("scopes preview runtime/history overrides to the selected assistant and ignores them in production", () => {
  window.__agentUIPreviewEnvironment = { agentId: "b", identity: "mock-b", runtimeEndpoint: "/mock", conversationDataEndpointOverride: "/mock-data" };
  expect(getPreviewAgentEnvironment(true, "a")).toBeUndefined();
  expect(getPreviewAgentEnvironment(true)).toBeUndefined();
  expect(getPreviewAgentEnvironment(true, "b")?.runtimeEndpoint).toBe("/mock");
  expect(getPreviewAgentEnvironment(false, "b")).toBeUndefined();
});
