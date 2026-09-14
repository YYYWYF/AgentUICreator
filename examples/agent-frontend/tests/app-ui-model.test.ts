import { describe, expect, it } from "vitest";

import appUIModelJson from "../app-ui/app-ui.json";
import {
  collectAppUIPluginLocations,
  parseAppUIModel,
} from "../framework/contracts/app-ui-model";

describe("AppUIModel v3", () => {
  it("parses the nested authoring source of truth", () => {
    const model = parseAppUIModel(appUIModelJson);
    const locations = collectAppUIPluginLocations(model);

    expect(model.version).toBe("3");
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

  it("rejects Runtime-only placement fields", () => {
    expect(() => parseAppUIModel({
      version: "3",
      root: {
        type: "slot",
        id: "main",
        description: "Main content.",
        plugins: [{
          id: "sample-main",
          pluginId: "sample",
          enabled: true,
          mount: { slotId: "runtime-only" },
        }],
      },
    })).toThrow();
  });

  it("rejects duplicate plugin ids across application and visual trees", () => {
    expect(() => parseAppUIModel({
      version: "3",
      applicationPlugins: [
        { id: "duplicate", pluginId: "provider", enabled: true },
      ],
      root: {
        type: "slot",
        id: "main",
        description: "Main content.",
        plugins: [{ id: "duplicate", pluginId: "visual", enabled: true }],
      },
    })).toThrow(/Duplicate plugin instance id/);
  });

  it("rejects blank plugin-local Slot names", () => {
    expect(() => parseAppUIModel({
      version: "3",
      root: {
        type: "slot",
        id: "main",
        description: "Main content.",
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
