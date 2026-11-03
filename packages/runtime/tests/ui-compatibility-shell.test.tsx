// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AgentUICompatibilityRoot, AgentUIProjectProvider, createAgentUIProject, createPluginCapabilityCatalog } from "../src/ui/index.js";

it("preserves the explicitly bound project shell and observes its container through Web Component adaptation", async () => {
  const mount = document.createElement("div"); document.body.append(mount);
  const root = createRoot(mount), committed = vi.fn();
  const manifest = { id: "view", name: "View", description: "Test", version: "1.0.0" };
  const project = createAgentUIProject({
    appUIModelSource: JSON.stringify({ root: { type: "slot", plugins: [{ pluginId: "view" }] } }),
    pluginCapabilityCatalog: createPluginCapabilityCatalog([{ manifest, provides: [], inject: [], optionalInject: [], loadDefinition: async () => ({ manifest, Component: () => <input defaultValue="draft" /> }) }]),
    capabilityCatalogRevision: "a".repeat(64),
    Shell: ({ children, surfaceRef }) => <article ref={surfaceRef} data-testid="custom-shell">{children}</article>,
  });
  try {
    await act(async () => root.render(<AgentUIProjectProvider value={project}>
      <AgentUICompatibilityRoot config={{ endpoint: "/agent", locale: "en-US" }} emit={() => {}} agentProps={{ observability: { onPreviewCommitted: committed } }} />
    </AgentUIProjectProvider>));
    await act(async () => { await vi.waitFor(() => expect(mount.querySelector("input")).not.toBeNull()); });
    const container = mount.querySelector<HTMLElement>("article")!;
    expect(committed).toHaveBeenLastCalledWith(expect.any(String), container);
    expect(container.hasAttribute("data-agent-ui-preview-root")).toBe(true);
    expect(container.parentElement?.hasAttribute("data-agent-ui-preview-root")).toBe(false);
    act(() => root.unmount());
    expect(container.hasAttribute("data-agent-ui-preview-root")).toBe(false);
  } finally { if (mount.querySelector("article")) act(() => root.unmount()); mount.remove(); }
});
