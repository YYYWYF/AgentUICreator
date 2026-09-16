import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  AGENT_UI_MODES,
  parseAgentUIMode,
  type AgentUIModeDefinition,
} from "../framework/contracts/agent-ui-mode";
import {
  parseAppUIModel,
  parseAppUIModelJson,
} from "../framework/contracts/app-ui-model";
import { compileAppUIModel } from "../framework/contracts/app-ui-compiler";
import {
  AgentUIModeRegistry,
  agentUIModeRegistry,
} from "../framework/modes";
import { generatePluginRegistry } from "../scripts/ui-project/registry-generator";

function collectLayoutSlots(
  node: ReturnType<typeof parseAppUIModel>["root"],
): string[] {
  if (node.type === "slot") return [node.id];
  if (node.type === "panel") return collectLayoutSlots(node.child);
  return node.children.flatMap(collectLayoutSlots);
}

describe("Agent UI Mode", () => {
  it("accepts only the platform mode", () => {
    expect(AGENT_UI_MODES).toEqual(["platform"]);
    for (const mode of AGENT_UI_MODES) {
      expect(parseAgentUIMode(mode)).toBe(mode);
    }
    expect(() => parseAgentUIMode("floating")).toThrow();
  });

  it("registers all built-in Modes in deterministic order", () => {
    expect(agentUIModeRegistry.list().map((definition) => definition.id)).toEqual(["platform"]);
    for (const mode of AGENT_UI_MODES) {
      expect(agentUIModeRegistry.has(mode)).toBe(true);
      expect(agentUIModeRegistry.get(mode).id).toBe(mode);
    }
  });

  it("rejects unknown lookups and duplicate registrations", () => {
    const registry = new AgentUIModeRegistry();
    const definition: AgentUIModeDefinition = {
      id: "platform",
      createInitialAppUIModel: () =>
        parseAppUIModel({
          root: { type: "slot", plugins: [] },
        }),
    };
    registry.register(definition);

    expect(() => registry.register(definition)).toThrow("already registered");
    expect(() =>
      registry.get("unknown" as Parameters<AgentUIModeRegistry["get"]>[0]),
    ).toThrow("not registered");
  });

  it("creates a fresh, valid platform composition", async () => {
    const projectRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );

    for (const definition of agentUIModeRegistry.list()) {
      const first = definition.createInitialAppUIModel();
      const second = definition.createInitialAppUIModel();
      expect(first).not.toBe(second);
      expect(first.root).not.toBe(second.root);
      expect(parseAppUIModel(first)).toEqual(first);

      const generation = await generatePluginRegistry(projectRoot, first);
      expect(generation.errors).toEqual([]);
      expect(() =>
        compileAppUIModel(
          first,
          generation.activeComposition.compositionCatalog,
        )
      ).not.toThrow();
    }

    const platformSlots = collectLayoutSlots(
      agentUIModeRegistry.get("platform").createInitialAppUIModel().root,
    );
    const currentAppUIModel = parseAppUIModelJson(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    );

    expect(platformSlots).toContain("conversation-navigation");
    expect(
      agentUIModeRegistry.get("platform").createInitialAppUIModel(),
    ).toEqual(currentAppUIModel);
  });
});
