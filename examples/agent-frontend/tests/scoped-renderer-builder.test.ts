import { describe, expect, it } from "vitest";

import { buildRuntimeComposition, createPluginCapabilityCatalog } from "../runtime/composition";

describe("optional renderer composition", () => {
  const fixture = (occupants: unknown[]) => {
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
      slots: { entity: occupants },
    }] } });
    return { catalog, source };
  };

  it("builds an empty optional renderer Slot", async () => {
    const { catalog, source } = fixture([]);
    const result = await buildRuntimeComposition({
      appUIModelSource: source,
      capabilityCatalog: catalog,
      capabilityCatalogRevision: "a".repeat(64),
    });
    expect(Object.keys(result.runtimeModel.pluginInstances)).toEqual(["surface-main"]);
  });

  it("rejects a declared renderer missing from the catalog", async () => {
    const { catalog, source } = fixture([
      { id: "missing-main", pluginId: "missing-renderer", enabled: true },
    ]);
    await expect(buildRuntimeComposition({
      appUIModelSource: source,
      capabilityCatalog: catalog,
      capabilityCatalogRevision: "a".repeat(64),
    })).rejects.toThrow('AppUIModel selects UI plugin "missing-renderer"');
  });
});
