import { generatedProjectFixture } from "../../../project-control/tests/support/generated-project";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compileAppUIModel } from "../../../project-control/src/framework/contracts/app-ui-compiler";
import {
  collectAppUIPluginLocations,
  parseAppUIModel,
  parseAppUIModelJson,
} from "../../../project-control/src/framework/contracts/app-ui-model";
import {
  AgentUIPresetRegistry,
  agentUIPresetRegistry,
} from "../../../project-control/src/framework/presets/index";
import { agentUIModeRegistry } from "../../../project-control/src/framework/modes/index";
import { generatePluginRegistry } from "../../../project-control/src/project/registry-generator";
import { uiProjectControlConfig } from "../../../project-control/src/project/project-config";
import { resolveAgentUIProjectPaths } from "../../../project-control/src/project/agent-ui-project-paths";
import { loadAgentUISourceRegistry } from "../../../source-registry/src/loader";
import { projectWorkspaceTopology } from "../../../project-control/src/project/workspace-topology";

function collectLayoutPluginIds(
  node: ReturnType<typeof parseAppUIModel>["root"],
): string[] {
  if (node.type === "slot") return node.plugins.map((plugin) => plugin.pluginId);
  if (node.type === "panel") return collectLayoutPluginIds(node.child);
  if (node.type === "sidebar") return [...(node.header ? collectLayoutPluginIds(node.header) : []), ...node.items.flatMap(item => collectLayoutPluginIds(item.child)), ...collectLayoutPluginIds(node.content)];
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
      expect(preset.sourceItems).toContain("plugin/conversation-quote");
      expect(preset.sourceItems).toContain("plugin/assistant-ui-lexical-composer-input");
      expect(preset.sourceItems).toContain("plugin/assistant-ui-lexical-edit-composer");
      expect(preset.sourceItems).toContain("plugin/assistant-ui-dictation-action");
    }
  });

  it.each(["assistant", "embedded", "platform"] as const)(
    "%s keeps dictation presentation in the Composer trailing actions",
    (mode) => {
      const model = agentUIPresetRegistry.getDefaultForMode(mode, agentUIModeRegistry).createAppUIModel();
      const locations = collectAppUIPluginLocations(model);
      expect(locations.find(({ plugin }) => plugin.pluginId === "assistant-ui-lexical-edit-composer"))?.toMatchObject({
        plugin: { id: "assistant-ui-lexical-edit-composer-main", enabled: true },
        target: { type: "plugin_slot", parentInstanceId: "agent-conversation-surface-main", slot: "userEditComposer" },
      });
      expect(locations.find(({ plugin }) => plugin.pluginId === "assistant-ui-lexical-composer-input"))?.toMatchObject({
        plugin: { enabled: true },
        target: { type: "plugin_slot", parentInstanceId: "assistant-ui-composer-main", slot: "input" },
      });
      expect(locations.find(({ plugin }) => plugin.pluginId === "conversation-quote"))?.toMatchObject({
        target: { type: "plugin_slot", parentInstanceId: "assistant-ui-composer-main", slot: "beforeInput" },
      });
      expect(locations.find(({ plugin }) => plugin.pluginId === "assistant-ui-dictation-action"))
        ?.toMatchObject({
          plugin: { enabled: true },
          target: { type: "plugin_slot", parentInstanceId: "assistant-ui-composer-main", slot: "trailingActions" },
        });
      expect(locations.find(({ plugin }) => plugin.pluginId === "assistant-ui-composer"))
        ?.toMatchObject({ target: { type: "plugin_slot", parentInstanceId: "agent-conversation-surface-main", slot: "composer" } });
    },
  );

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
    const projectRoot = await generatedProjectFixture();

    const registry = await loadAgentUISourceRegistry();
    const editComposer = registry.byId.get("plugin/assistant-ui-lexical-edit-composer")!;
    for (const file of [...editComposer.loadedFiles, ...registry.byId.get("plugin/agent-identity")!.loadedFiles]) {
      const destination = path.join(projectRoot, "agent-ui", file.target);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, file.content);
    }
    for (const preset of agentUIPresetRegistry.list()) {
      const first = preset.createAppUIModel();
      const second = preset.createAppUIModel();
      expect(first).not.toBe(second);
      expect(first.root).not.toBe(second.root);
      if (first.root.type === "row" && second.root.type === "row") {
        expect(first.root.children[0]).not.toBe(second.root.children[0]);
      }
      expect(parseAppUIModel(first)).toEqual(first);

      const generation = await generatePluginRegistry(projectRoot, first, { config: uiProjectControlConfig, paths: resolveAgentUIProjectPaths(projectRoot, { mode: preset.mode, sourceRoot: "agent-ui" }) });
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
    ["assistant", "assistant/default", true, ["center"]],
    ["embedded", "embedded/default", false, ["center"]],
    ["platform", "platform/default", true, ["center"]],
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
      expect(applicationPluginIds).toContain("conversation-command-source");
      const nestedPluginIds = collectAppUIPluginLocations(model).map(entry => entry.plugin.pluginId);
      expect(nestedPluginIds).toContain("assistant-ui-mention-trigger");
      expect(nestedPluginIds).toContain("assistant-ui-slash-command-trigger");
      expect(applicationPluginIds).not.toContain("composer-trigger-demo");

      const topology = projectWorkspaceTopology(
        model,
        agentUIModeRegistry.get(mode).workspace,
      );
      expect(Object.keys(topology.regions)).toEqual(occupiedRegions);
    },
  );

  it("preserves existing Platform layouts while new presets adopt Sidebar", async () => {
    const projectRoot = await generatedProjectFixture();
    const currentAppUIModel = parseAppUIModelJson(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    );
    const platformPresetModel = parseAppUIModelJson(
      await readFile(
        path.join(projectRoot, "presets", "platform", "app-ui.json"),
        "utf8",
      ),
    );

    expect(currentAppUIModel.root.type).toBe("row");
    expect(platformPresetModel.root.type).toBe("sidebar");
    expect(collectLayoutPluginIds(platformPresetModel.root)).toEqual(["agent-identity", ...collectLayoutPluginIds(currentAppUIModel.root)]);
  });
});
