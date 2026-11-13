// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { usePluginActions, type UIPluginDefinition } from "@za38.03/agent-ui-plugins";
import { useAgentRun } from "@za38.03/agent-ui-runtime";
import { AgentApplication, createAgentUIProject, createPluginCapabilityCatalog } from "@za38.03/agent-ui-runtime/ui";
import { AssistantShell } from "../../../plugins/resources/registry/items/foundation/shell-assistant/files/application/shell/AssistantShell";
import { EmbeddedShell } from "../../../plugins/resources/registry/items/foundation/shell-embedded/files/application/shell/EmbeddedShell";
import { PlatformShell } from "../../../plugins/resources/registry/items/foundation/shell-platform/files/application/shell/PlatformShell";

it("keeps the project shell, draft, Plugin service and active run alive while the panel is hidden", async () => {
  const started = vi.fn(), stopped = vi.fn(), mounted = vi.fn(), unmounted = vi.fn();
  const provider: UIPluginDefinition = {
    manifest: { id: "service", name: "Service", description: "Test service", version: "1.0.0", capabilities: ["headless"] },
    provides: ["test.shell"],
    setup: ({ services }) => { started(); services.provide("test.shell", {}); return stopped; },
    Component: () => null,
  };
  function View() {
    const actions = usePluginActions(), run = useAgentRun();
    useEffect(() => { mounted(); return unmounted; }, []);
    return <><input defaultValue="draft" /><output>{run.status}</output><button onClick={() => { void actions.sendMessage("Hello"); }}>send</button></>;
  }
  const view: UIPluginDefinition = { manifest: { id: "view", name: "View", description: "Test view", version: "1.0.0" }, Component: View };
  const project = createAgentUIProject({
    appUIModelSource: JSON.stringify({ applicationPlugins: [{ pluginId: "service" }], root: { type: "slot", plugins: [{ pluginId: "view" }] } }),
    pluginCapabilityCatalog: createPluginCapabilityCatalog([provider, view].map(definition => ({ ...definition, provides: definition.provides ?? [], inject: [], optionalInject: [], loadDefinition: async () => definition }))),
    capabilityCatalogRevision: "a".repeat(64), Shell: AssistantShell,
  });
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  let request!: { threadId: string; runId: string };
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    request = JSON.parse(String(init.body));
    return new Response(new ReadableStream({ start(controller) { stream = controller; } }), { headers: { "Content-Type": "text/event-stream" } });
  }));
  const emit = (type: string) => stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type, threadId: request.threadId, runId: request.runId })}\n\n`));
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const committed = vi.fn();
  const render = async (locale: "en-US" | "zh-CN" = "en-US") => {
    await act(async () => { root.render(<AgentApplication project={project} assistantPanelWidth={480} locale={locale} observability={{ onPreviewCommitted: committed }} />); });
    await act(async () => { await vi.waitFor(() => expect(container.querySelector("input")).not.toBeNull()); });
  };
  try {
    await render();
    const panel = container.querySelector<HTMLElement>(".agent-ui-assistant-panel")!;
    const trigger = container.querySelector<HTMLButtonElement>(".agent-ui-assistant-trigger")!;
    const input = container.querySelector("input")!;
    expect(committed).not.toHaveBeenCalled();
    expect(panel.hidden).toBe(true);
    expect(trigger.getAttribute("aria-label")).toBe("Open assistant");
    expect(container.querySelector<HTMLElement>(".agent-ui-assistant-shell")!.style.getPropertyValue("--agent-ui-assistant-panel-width")).toBe("480px");
    act(() => trigger.click()); input.value = "Keep my draft";
    expect(panel.hidden).toBe(false);
    expect(committed).toHaveBeenLastCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/), panel);
    expect(panel.hasAttribute("data-agent-ui-preview-root")).toBe(true);
    await act(async () => { container.querySelector<HTMLButtonElement>(".agent-ui-assistant-panel button")!.click(); });
    await act(async () => { emit("RUN_STARTED"); });
    await vi.waitFor(() => expect(container.querySelector("output")?.textContent).toBe("running"));
    act(() => trigger.click());
    expect(panel.hidden).toBe(true);
    expect(panel.hasAttribute("data-agent-ui-preview-root")).toBe(false);
    expect(stopped).not.toHaveBeenCalled(); expect(unmounted).not.toHaveBeenCalled();
    await act(async () => { emit("RUN_FINISHED"); stream.close(); });
    await act(async () => { await vi.waitFor(() => expect(container.querySelector("output")?.textContent).toBe("idle")); });
    await render("zh-CN");
    expect(trigger.getAttribute("aria-label")).toBe("打开助手");
    act(() => trigger.click());
    expect(container.querySelector("input")).toBe(input); expect(input.value).toBe("Keep my draft");
    expect(committed).toHaveBeenCalledTimes(2);
    expect(committed).toHaveBeenLastCalledWith(expect.any(String), panel);
    expect(started).toHaveBeenCalledTimes(1); expect(mounted).toHaveBeenCalledTimes(1);
    expect(stopped).not.toHaveBeenCalled(); expect(unmounted).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  expect(stopped).toHaveBeenCalledTimes(1); expect(unmounted).toHaveBeenCalledTimes(1);
});

it.each(["platform", "embedded"] as const)("renders the project %s shell", async mode => {
  const container = document.createElement("div"); const root = createRoot(container);
  try {
    const Shell = mode === "platform" ? PlatformShell : EmbeddedShell;
    act(() => root.render(<Shell><input defaultValue="content" /></Shell>));
    expect(container.querySelector(`.agent-ui-${mode}-shell input`)).not.toBeNull();
    expect(container.querySelector(".agent-ui-assistant-trigger")).toBeNull();
  } finally { act(() => root.unmount()); }
});
