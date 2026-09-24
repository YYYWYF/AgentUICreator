import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compileAppUIModel } from "../framework/contracts/app-ui-compiler";
import {
  parseAppUIModel,
  parseAppUIModelJson,
} from "../framework/contracts/app-ui-model";
import {
  AgentUIPresetRegistry,
  agentUIPresetRegistry,
} from "../framework/presets";
import { agentUIModeRegistry } from "../framework/modes";
import { generatePluginRegistry } from "../scripts/ui-project/registry-generator";
import { projectWorkspaceTopology } from "../scripts/ui-project/workspace-topology";

function collectLayoutPluginIds(
  node: ReturnType<typeof parseAppUIModel>["root"],
): string[] {
  if (node.type === "slot") return node.plugins.map((plugin) => plugin.pluginId);
  if (node.type === "panel") return collectLayoutPluginIds(node.child);
  return node.children.flatMap(collectLayoutPluginIds);
}

describe("Agent UI Preset", () => {
  it("registers one canonical default preset for each Mode", () => {
    expect(agentUIPresetRegistry.list().map((preset) => preset.id)).toEqual([
      "assistant/default",
      "embedded/default",
      "platform/default",
    ]);

    for (const mode of ["assistant", "embedded", "platform"] as const) {
      const preset = agentUIPresetRegistry.getDefaultForMode(
        mode,
        agentUIModeRegistry,
      );
      expect(preset.mode).toBe(mode);
      expect(preset.id).toBe(agentUIModeRegistry.get(mode).defaultPresetId);
      expect(preset.sourceItems).toContain("foundation/conversation");
    }
  });

  it("rejects duplicate, missing, and mismatched default presets", () => {
    const registry = new AgentUIPresetRegistry();
    const assistantPreset = agentUIPresetRegistry.get("assistant/default");
    registry.register(assistantPreset);
    expect(() => registry.register(assistantPreset)).toThrow("already registered");
    expect(() => registry.get("missing/default")).toThrow("not registered");

    const mismatchedRegistry = new AgentUIPresetRegistry();
    mismatchedRegistry.register({
      ...assistantPreset,
      mode: "embedded",
    });
    expect(() =>
      mismatchedRegistry.getDefaultForMode("assistant", agentUIModeRegistry),
    ).toThrow('belongs to Mode "embedded", not "assistant"');
  });

  it("returns a fresh valid AppUIModel and compiles every default preset", async () => {
    const projectRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );

    for (const preset of agentUIPresetRegistry.list()) {
      const first = preset.createAppUIModel();
      const second = preset.createAppUIModel();
      expect(first).not.toBe(second);
      expect(first.root).not.toBe(second.root);
      if (first.root.type === "row" && second.root.type === "row") {
        expect(first.root.children[0]).not.toBe(second.root.children[0]);
      }
      expect(parseAppUIModel(first)).toEqual(first);

      const generation = await generatePluginRegistry(projectRoot, first);
      expect(generation.errors).toEqual([]);
      expect(() =>
        compileAppUIModel(
          first,
          generation.activeComposition.compositionCatalog,
        ),
      ).not.toThrow();
    }
  });

  it.each([
    ["assistant", "assistant/default", false, ["center"]],
    ["embedded", "embedded/default", false, ["center"]],
    ["platform", "platform/default", true, ["left", "center"]],
  ] as const)(
    "%s has the expected conversation and Workspace topology",
    async (mode, presetId, hasThreadList, occupiedRegions) => {
      const preset = agentUIPresetRegistry.get(presetId);
      const model = preset.createAppUIModel();
      const pluginIds = collectLayoutPluginIds(model.root);
      const applicationPluginIds = (model.applicationPlugins ?? []).map(
        (plugin) => plugin.pluginId,
      );

      expect(pluginIds).toContain("conversation-surface");
      expect(pluginIds.includes("conversation-thread-list")).toBe(hasThreadList);
      expect(applicationPluginIds).toContain("conversation-data-source");
      expect(applicationPluginIds).toContain("conversation-service");

      const topology = projectWorkspaceTopology(
        model,
        agentUIModeRegistry.get(mode).workspace,
      );
      expect(Object.keys(topology.regions)).toEqual(occupiedRegions);
    },
  );

  it("keeps the checked-in Platform composition as the Platform preset baseline", async () => {
    const projectRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const currentAppUIModel = parseAppUIModelJson(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    );
    const platformPresetModel = parseAppUIModelJson(
      await readFile(
        path.join(projectRoot, "presets", "platform", "app-ui.json"),
        "utf8",
      ),
    );

    expect(platformPresetModel).toEqual(currentAppUIModel);
  });
});
