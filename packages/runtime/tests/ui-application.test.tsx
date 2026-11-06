// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AGENT_UI_PRESENTATION_LOCALES } from "@za38.03/agent-ui-plugins";
import { AgentApplication, createPluginCapabilityCatalog, createRuntimeCompositionStore, type AgentUIProjectOptions } from "../src/ui/index.js";

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
    getConversationStarterSuggestions: () => [], conversationMessageQueueEnabled: false,
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
