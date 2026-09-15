import { describe, expect, it } from "vitest";

import type { AppUIModel } from "../framework/contracts/app-ui-model";
import {
  AppUIOperationError,
  applyAppUIOperations,
} from "../scripts/ui-project/app-ui-operations";

function model(): AppUIModel {
  return {
    applicationPlugins: [],
    root: {
      type: "slot",
      plugins: [{
        id: "surface-main",
        pluginId: "surface",
        enabled: true,
        slots: { content: [] },
      }],
    },
  };
}

describe("AppUIModel semantic operations", () => {
  it("inserts directly into Layout and plugin-local Slots", () => {
    const result = applyAppUIOperations(model(), [
      {
        type: "insert_plugin",
        plugin: { id: "toolbar-main", pluginId: "toolbar", enabled: true },
        target: { type: "layout_slot", slotRef: "l0" },
        index: 0,
      },
      {
        type: "insert_plugin",
        plugin: { id: "item-main", pluginId: "item", enabled: true },
        target: {
          type: "plugin_slot",
          parentInstanceId: "surface-main",
          slot: "content",
        },
      },
    ]);

    expect(result.root.type).toBe("slot");
    if (result.root.type !== "slot") throw new Error("fixture");
    expect(result.root.plugins.map((plugin) => plugin.id)).toEqual([
      "toolbar-main",
      "surface-main",
    ]);
    expect(result.root.plugins[1]?.slots?.content?.[0]?.id).toBe("item-main");
  });

  it("moves a plugin subtree without exposing Runtime placement", () => {
    const result = applyAppUIOperations(model(), [{
      type: "move_plugin",
      instanceId: "surface-main",
      target: { type: "application" },
    }]);

    expect(result.applicationPlugins?.[0]?.id).toBe("surface-main");
    if (result.root.type !== "slot") throw new Error("fixture");
    expect(result.root.plugins).toEqual([]);
  });

  it("rejects moving a plugin into its own descendant", () => {
    expect(() => applyAppUIOperations(model(), [{
      type: "move_plugin",
      instanceId: "surface-main",
      target: {
        type: "plugin_slot",
        parentInstanceId: "surface-main",
        slot: "content",
      },
    }])).toThrow(AppUIOperationError);
  });

  it("updates, disables, replaces, and removes authoring plugin nodes", () => {
    const updated = applyAppUIOperations(model(), [
      {
        type: "update_plugin_props",
        instanceId: "surface-main",
        set: { title: "Surface" },
      },
      {
        type: "set_plugin_enabled",
        instanceId: "surface-main",
        enabled: false,
      },
      {
        type: "replace_plugin",
        instanceId: "surface-main",
        replacement: {
          id: "replacement-main",
          pluginId: "replacement",
          enabled: true,
        },
      },
    ]);
    if (updated.root.type !== "slot") throw new Error("fixture");
    expect(updated.root.plugins).toEqual([{
      id: "replacement-main",
      pluginId: "replacement",
      enabled: true,
    }]);

    const removed = applyAppUIOperations(updated, [{
      type: "remove_plugin",
      instanceId: "replacement-main",
    }]);
    if (removed.root.type !== "slot") throw new Error("fixture");
    expect(removed.root.plugins).toEqual([]);
  });

  it("replaces a subtree while allowing its existing ids to be retained", () => {
    const result = applyAppUIOperations(model(), [{
      type: "replace_plugin",
      instanceId: "surface-main",
      replacement: {
        id: "surface-main",
        pluginId: "surface-v2",
        enabled: true,
        slots: {
          content: [{ id: "item-main", pluginId: "item", enabled: true }],
        },
      },
    }]);

    if (result.root.type !== "slot") throw new Error("fixture");
    expect(result.root.plugins[0]?.pluginId).toBe("surface-v2");
    expect(result.root.plugins[0]?.slots?.content?.[0]?.id).toBe("item-main");
  });
});
