import { describe, expect, it } from "vitest";

import appUIModelJson from "../app-ui/app-ui.json";
import {
  collectAppUIPluginLocations,
  parseAppUIModel,
} from "../framework/contracts/app-ui-model";

describe("AppUIModel", () => {
  it("parses the nested authoring source of truth", () => {
    const model = parseAppUIModel(appUIModelJson);
    const locations = collectAppUIPluginLocations(model);

    expect(model).not.toHaveProperty("pluginInstances");
    expect(locations.map(({ plugin }) => plugin.id)).toContain(
      "conversation-suggestions-main",
    );
    expect(locations.find(({ plugin }) => plugin.id === "theme-provider-main")?.target)
      .toEqual({ type: "application" });
    expect(locations.find(({ plugin }) => plugin.id === "conversation-suggestions-main")?.target)
      .toEqual({
        type: "plugin_slot",
        parentInstanceId: "agent-conversation-surface-main",
        slot: "emptySuggestions",
    });
  });

  it("rejects the removed schema version field", () => {
    expect(() => parseAppUIModel({
      version: "3",
      root: {
        type: "slot",
        plugins: [],
      },
    })).toThrow();
  });

  it("rejects Runtime-only placement fields", () => {
    expect(() => parseAppUIModel({
      root: {
        type: "slot",
        plugins: [{
          id: "sample-main",
          pluginId: "sample",
          enabled: true,
          mount: { slotId: "runtime-only" },
        }],
      },
    })).toThrow();
  });

  it("keeps layout identity and metadata out of the authoring model", () => {
    expect(() => parseAppUIModel({
      root: {
        type: "row",
        id: "foo",
        children: [],
      },
    })).toThrow();
    expect(() => parseAppUIModel({
      root: {
        type: "slot",
        description: "foo",
        plugins: [],
      },
    })).toThrow();
    expect(() => parseAppUIModel({
      root: {
        type: "slot",
        localRef: "$foo",
        plugins: [],
      },
    })).toThrow();
  });

  it("rejects duplicate plugin ids across application and visual trees", () => {
    expect(() => parseAppUIModel({
      applicationPlugins: [
        { id: "duplicate", pluginId: "provider", enabled: true },
      ],
      root: {
        type: "slot",
        plugins: [{ id: "duplicate", pluginId: "visual", enabled: true }],
      },
    })).toThrow(/Duplicate plugin instance id/);
  });

  it("rejects blank plugin-local Slot names", () => {
    expect(() => parseAppUIModel({
      root: {
        type: "slot",
        plugins: [{
          id: "surface-main",
          pluginId: "surface",
          enabled: true,
          slots: { " ": [] },
        }],
      },
    })).toThrow();
  });
});
