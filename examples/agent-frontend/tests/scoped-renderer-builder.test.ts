import { describe, expect, it } from "vitest";

import { buildRuntimeComposition, createPluginCapabilityCatalog } from "../runtime/composition";

describe("optional renderer composition", () => {
  it("keeps the host loadable when an optional renderer Plugin is absent from the catalog", async () => {
    const manifest = {
      id: "surface", name: "Surface", description: "Host fixture", version: "1.0.0",
      slots: { children: { entity: {
        description: "Entity renderer", cardinality: "one" as const,
        mode: "renderer" as const, optional: true,
        accepts: { anyOfCapabilities: ["entity-renderer"] },
      } } },
    };
    const catalog = createPluginCapabilityCatalog([{
      manifest, provides: [], inject: [], optionalInject: [],
      loadDefinition: async () => ({ manifest, Component: () => null }),
    }]);
    const source = JSON.stringify({ root: { type: "slot", plugins: [{
      id: "surface-main", pluginId: "surface", enabled: true,
      slots: { entity: [{ id: "missing-main", pluginId: "missing-renderer", enabled: true }] },
    }] } });
    const result = await buildRuntimeComposition({
      appUIModelSource: source,
      capabilityCatalog: catalog,
      capabilityCatalogRevision: "a".repeat(64),
    });
    expect(result.activeRegistry.get("missing-renderer")).toBeUndefined();
    expect(result.runtimeModel.pluginInstances["missing-main"]?.mount?.slotId)
      .toBe("plugin:surface-main:entity");
  });
});
