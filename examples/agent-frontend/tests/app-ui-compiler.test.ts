import { describe, expect, it } from "vitest";

import {
  AppUICompilerError,
  compileAppUIModel,
} from "../framework/contracts/app-ui-compiler";
import type { AppUIModel } from "../framework/contracts/app-ui-model";
import {
  type PluginCompositionCatalog,
  resolveRuntimePluginSlotId,
} from "../framework/contracts/app-ui-composition";

const catalog: PluginCompositionCatalog = {
  provider: { capabilities: ["headless"] },
  surface: {
    childSlots: {
      content: {
        description: "Content rendered inside the surface.",
        cardinality: "many",
        optional: true,
      },
    },
  },
  item: {},
};

function model(surfaceId = "surface-main"): AppUIModel {
  return {
    applicationPlugins: [
      { id: "provider-main", pluginId: "provider", enabled: true },
    ],
    root: {
      type: "slot",
      id: "main",
      description: "Primary application content.",
      plugins: [
        {
          id: surfaceId,
          pluginId: "surface",
          enabled: true,
          slots: {
            content: [
              { id: "item-main", pluginId: "item", enabled: true },
            ],
          },
        },
      ],
    },
  };
}

describe("compileAppUIModel", () => {
  it("deterministically lowers authoring order and local Slots", () => {
    const first = compileAppUIModel(model(), catalog);
    const second = compileAppUIModel(model(), catalog);

    expect(second).toEqual(first);
    expect(first.root).toEqual({
      type: "slot",
      id: "main",
      slotId: "layout:main",
    });
    expect(first.pluginInstances["provider-main"]?.mount).toBeUndefined();
    expect(first.pluginInstances["surface-main"]?.mount).toEqual({
      slotId: "layout:main",
      order: 0,
    });
    expect(first.pluginInstances["item-main"]?.mount).toEqual({
      slotId: "plugin:surface-main:content",
      order: 0,
    });
  });

  it("gives each plugin instance collision-free Runtime child Slot ids", () => {
    const source = model("surface-one");
    if (source.root.type !== "slot") throw new Error("fixture");
    source.root.plugins.push({
      id: "surface-two",
      pluginId: "surface",
      enabled: true,
      slots: {
        content: [
          { id: "item-two", pluginId: "item", enabled: true },
        ],
      },
    });
    const runtime = compileAppUIModel(source, catalog);

    expect(runtime.pluginInstances["item-main"]?.mount?.slotId).toBe(
      "plugin:surface-one:content",
    );
    expect(runtime.pluginInstances["item-two"]?.mount?.slotId).toBe(
      "plugin:surface-two:content",
    );
  });

  it("encodes Runtime child Slot tuple parts without delimiter collisions", () => {
    const first = resolveRuntimePluginSlotId("a:b", "c");
    const second = resolveRuntimePluginSlotId("a", "b:c");

    expect(first).toBe("plugin:a%3Ab:c");
    expect(second).toBe("plugin:a:b%3Ac");
    expect(first).not.toBe(second);
    expect(resolveRuntimePluginSlotId("a:b", "c")).toBe(first);
  });

  it("rejects undeclared local Slots", () => {
    const source = model();
    if (source.root.type !== "slot") throw new Error("fixture");
    source.root.plugins[0]!.slots = {
      unknown: [{ id: "item-main", pluginId: "item", enabled: true }],
    };

    expect(() => compileAppUIModel(source, catalog)).toThrow(AppUICompilerError);
  });

  it("rejects unknown plugins before producing Runtime IR", () => {
    const source = model();
    if (source.root.type !== "slot") throw new Error("fixture");
    source.root.plugins.push({
      id: "unknown-main",
      pluginId: "unknown",
      enabled: true,
    });

    expect(() => compileAppUIModel(source, catalog)).toThrow(
      /references unknown plugin "unknown"/,
    );
  });

  it("preserves authoring props and settings without sharing mutable objects", () => {
    const source = model();
    source.settings = { theme: "light" };
    if (source.root.type !== "slot") throw new Error("fixture");
    source.root.plugins[0]!.props = { density: "compact" };

    const runtime = compileAppUIModel(source, catalog);
    expect(runtime.settings).toEqual({ theme: "light" });
    expect(runtime.pluginInstances["surface-main"]?.props).toEqual({
      density: "compact",
    });

    source.settings.theme = "dark";
    source.root.plugins[0]!.props!.density = "comfortable";
    expect(runtime.settings).toEqual({ theme: "light" });
    expect(runtime.pluginInstances["surface-main"]?.props).toEqual({
      density: "compact",
    });
  });

  it("enforces required and one-cardinality child Slots", () => {
    const constrainedCatalog: PluginCompositionCatalog = {
      ...catalog,
      surface: {
        childSlots: {
          content: {
            description: "Exactly one required content plugin.",
            cardinality: "one",
          },
        },
      },
    };
    const missing = model();
    if (missing.root.type !== "slot") throw new Error("fixture");
    missing.root.plugins[0]!.slots = {};
    expect(() => compileAppUIModel(missing, constrainedCatalog)).toThrow(
      /requires content/,
    );

    const crowded = model();
    if (crowded.root.type !== "slot") throw new Error("fixture");
    crowded.root.plugins[0]!.slots!.content!.push({
      id: "item-second",
      pluginId: "item",
      enabled: true,
    });
    expect(() => compileAppUIModel(crowded, constrainedCatalog)).toThrow(
      /accepts at most one plugin/,
    );
  });

  it("enforces application and visual placement boundaries", () => {
    const visualAtApplication = model();
    visualAtApplication.applicationPlugins!.push({
      id: "item-application",
      pluginId: "item",
      enabled: true,
    });
    expect(() => compileAppUIModel(visualAtApplication, catalog)).toThrow(
      /must be headless/,
    );

    const headlessInLayout = model();
    if (headlessInLayout.root.type !== "slot") throw new Error("fixture");
    headlessInLayout.root.plugins.push({
      id: "provider-visual",
      pluginId: "provider",
      enabled: true,
    });
    expect(() => compileAppUIModel(headlessInLayout, catalog)).toThrow(
      /must be declared in applicationPlugins/,
    );
  });
});
