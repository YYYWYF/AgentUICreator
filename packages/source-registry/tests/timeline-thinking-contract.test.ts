import { describe, expect, it } from "vitest";
import { loadAgentUISourceRegistry, resolveAgentUISourceItemClosure, resolveOfficialResource } from "../src/index.js";

describe("official Timeline and Thinking source contracts", () => {
  it.each([
    ["tool-timeline", "assistant-ui-tool-timeline", "toolTimeline", "conversation-tool-timeline-renderer"],
    ["thinking-indicator", "assistant-ui-thinking-indicator", "thinkingIndicator", "conversation-thinking-indicator-renderer"],
  ])("publishes %s through the existing source closure and deterministic placement", async (resource, id, slot, capability) => {
    const registry = await loadAgentUISourceRegistry();
    expect(resolveOfficialResource(resource!).implementation).toMatchObject({ type: "plugin", pluginId: id, slot });
    const closure = resolveAgentUISourceItemClosure(registry, `plugin/${id}`);
    expect(closure.some(item => item.id === "foundation/core")).toBe(true);
    const item = registry.byId.get(`plugin/${id}`)!;
    const manifest = JSON.parse(await (await import("node:fs/promises")).readFile(item.loadedFiles.find(file => file.target.endsWith("manifest.json"))!.absolutePath, "utf8"));
    expect(manifest).toMatchObject({ requiresRenderScope: true, capabilities: [capability], authoring: {
      defaultPlacement: { type: "plugin_slot", parentPluginId: "conversation-surface", slot },
    } });
    const host = registry.byId.get("plugin/conversation-surface")!;
    const hostManifest = JSON.parse(await (await import("node:fs/promises")).readFile(host.loadedFiles.find(file => file.target.endsWith("manifest.json"))!.absolutePath, "utf8"));
    expect(hostManifest.slots.children[slot!]).toMatchObject({ mode: "renderer", cardinality: "one", optional: true, accepts: { anyOfCapabilities: [capability] } });
    expect(item.packages?.["@agent-ui/react"]).toBe("^0.1.5");
  });
});
