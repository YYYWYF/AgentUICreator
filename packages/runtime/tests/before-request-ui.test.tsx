// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AgentApplication, createAgentUIProject, createPluginCapabilityCatalog } from "../src/ui/index.js";
import { AgentUIProjectProvider } from "../src/ui/project-context.js";
import { AgentUICompatibilityRoot } from "../src/ui/application/AgentUICompatibilityRoot.js";
import { useAgentUI, useAgentUIState, type AgentUIBeforeRequest } from "../src/public.js";
import type { UIPluginDefinition } from "../src/contracts/index.js";
import type { RunAgentInput } from "@ag-ui/client";

const cleanup: (() => void)[] = [];
afterEach(async () => { await act(async () => cleanup.splice(0).reverse().forEach(stop => stop())); vi.unstubAllGlobals(); });
async function until(predicate: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error("APPLICATION_REQUEST_DID_NOT_SETTLE");
}

it.each(["React", "Web Component", "multiple embedded Agents"])("forwards %s beforeRequest through the application boundary", async entry => {
  const requests: RunAgentInput[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const input = JSON.parse(String(init.body)) as RunAgentInput;
    requests.push(input);
    const frames = [{ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
      { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId, outcome: { type: "success" } }];
    return new Response(frames.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  }));
  function View() {
    const host = useAgentUI();
    const id = useAgentUIState(state => state.runtime?.conversation.id ?? "");
    const running = useAgentUIState(state => state.runtime?.run.status === "running");
    return <><button disabled={running} onClick={() => { void host.sendMessage("hello"); }}>send</button><output>{id}</output></>;
  }
  const definition: UIPluginDefinition = { manifest: { id: "view", name: "View", description: "Test", version: "1.0.0" }, Component: View };
  const project = createAgentUIProject({
    appUIModelSource: JSON.stringify({ root: { type: "slot", plugins: [{ pluginId: "view" }] } }),
    pluginCapabilityCatalog: createPluginCapabilityCatalog([{ ...definition, provides: [], inject: [], optionalInject: [], loadDefinition: async () => definition }]),
    capabilityCatalogRevision: "a".repeat(64),
  });
  const hook = vi.fn<AgentUIBeforeRequest>(async input => ({ threadId: input.threadId ?? "business", runId: `business-${requests.length + 1}` }));
  const node = document.createElement("div"); document.body.append(node);
  const root = createRoot(node); cleanup.push(() => node.remove(), () => root.unmount());
  await act(async () => root.render(<StrictMode>{entry === "React" ? <AgentApplication project={project} endpoint="/agent" beforeRequest={hook} /> :
    <AgentUIProjectProvider value={project}><AgentUICompatibilityRoot config={entry === "Web Component"
      ? { locale: "zh-CN", endpoint: "/agent", beforeRequest: hook }
      : { locale: "zh-CN", agents: [{ agentId: "one", endpoint: "/agent", beforeRequest: hook }] }} emit={() => {}} /></AgentUIProjectProvider>
  }</StrictMode>));
  await until(() => node.querySelector("button") !== null);
  for (let count = 1; count <= 2; count++) {
    await act(async () => node.querySelector("button")!.click());
    await until(() => requests.length === count && !node.querySelector("button")!.disabled);
    expect(node.querySelector("output")?.textContent).toBe("business");
  }
  expect(hook.mock.calls.map(([input]) => input.threadId)).toEqual([undefined, "business"]);
  expect(requests.map(input => input.runId)).toEqual(["business-1", "business-2"]);
});
