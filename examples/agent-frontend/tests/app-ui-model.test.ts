import { describe, expect, it } from "vitest";

import appUIModelJson from "../app-ui/app-ui.json";
import {
  collectAppUIPluginLocations,
  parseAppUIModel,
} from "../framework/contracts/app-ui-model";

describe("AppUIModel", () => {
  it("keeps Grid tracks separate from Panel dimensions", () => {
    for (const width of ["1fr", "0.5fr", "minmax(0, 1fr)", "repeat(2, 1fr)", "subgrid"]) {
      expect(() => parseAppUIModel({ root: {
        type: "panel", width, child: { type: "slot", plugins: [] },
      } })).toThrow();
    }
    expect(() => parseAppUIModel({ root: {
      type: "panel", height: "minmax(0, 1fr)", child: { type: "slot", plugins: [] },
    } })).toThrow();
    for (const width of ["280px", "100%", "24rem", "calc(100% - 2rem)", "auto", "fit-content(20rem)"]) {
      expect(() => parseAppUIModel({ root: {
        type: "panel", width, child: { type: "slot", plugins: [] },
      } })).not.toThrow();
    }
    for (const size of ["1fr", "minmax(0, 1fr)"]) {
      expect(() => parseAppUIModel({ root: {
        type: "row", sizes: [size], children: [{ type: "slot", plugins: [] }],
      } })).not.toThrow();
    }
  });
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

  it("rejects Plugin props and AppUIModel settings from Composition", () => {
    expect(() => parseAppUIModel({
      root: {
        type: "slot",
        plugins: [{
          id: "sample-main",
          pluginId: "sample",
          enabled: true,
          props: { title: "not part of AppUIModel" },
        }],
      },
    })).toThrow();
    expect(() => parseAppUIModel({
      settings: { theme: "dark" },
      root: {
        type: "slot",
        plugins: [],
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
