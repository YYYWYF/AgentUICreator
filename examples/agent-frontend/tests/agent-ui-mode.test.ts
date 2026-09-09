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
import { validateAppUIComposition } from "../framework/contracts/app-ui-composition";
import {
  AgentUIModeRegistry,
  agentUIModeRegistry,
} from "../framework/modes";
import { generatePluginRegistry } from "../scripts/ui-project/registry-generator";

function collectLayoutSlots(
  node: ReturnType<typeof parseAppUIModel>["root"],
): string[] {
  if (node.type === "slot") return [node.slotId];
  if (node.type === "panel") return collectLayoutSlots(node.child);
  return node.children.flatMap(collectLayoutSlots);
}

describe("Agent UI Mode", () => {
  it("accepts exactly assistant, embedded, and platform", () => {
    expect(AGENT_UI_MODES).toEqual(["assistant", "embedded", "platform"]);
    for (const mode of AGENT_UI_MODES) {
      expect(parseAgentUIMode(mode)).toBe(mode);
    }
    expect(() => parseAgentUIMode("floating")).toThrow();
  });

  it("registers all built-in Modes in deterministic order", () => {
    expect(agentUIModeRegistry.list().map((definition) => definition.id)).toEqual(
      ["assistant", "embedded", "platform"],
    );
    for (const mode of AGENT_UI_MODES) {
      expect(agentUIModeRegistry.has(mode)).toBe(true);
      expect(agentUIModeRegistry.get(mode).id).toBe(mode);
    }
  });

  it("rejects unknown lookups and duplicate registrations", () => {
    const registry = new AgentUIModeRegistry();
    const definition: AgentUIModeDefinition = {
      id: "assistant",
      createInitialAppUIModel: () =>
        parseAppUIModel({
          version: "2",
          root: { type: "slot", id: "root-node", slotId: "root" },
          pluginInstances: {},
        }),
    };
    registry.register(definition);

    expect(() => registry.register(definition)).toThrow("already registered");
    expect(() =>
      registry.get("unknown" as Parameters<AgentUIModeRegistry["get"]>[0]),
    ).toThrow("not registered");
  });

  it("creates fresh, valid compositions with Mode-specific Slot topology", async () => {
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
        validateAppUIComposition(first, generation.slotCatalog),
      ).not.toThrow();
    }

    const assistantSlots = collectLayoutSlots(
      agentUIModeRegistry.get("assistant").createInitialAppUIModel().root,
    );
    const embeddedSlots = collectLayoutSlots(
      agentUIModeRegistry.get("embedded").createInitialAppUIModel().root,
    );
    const platformSlots = collectLayoutSlots(
      agentUIModeRegistry.get("platform").createInitialAppUIModel().root,
    );
    const currentAppUIModel = parseAppUIModelJson(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    );

    expect(assistantSlots).toEqual([
      "assistant.conversation",
      "assistant.composer",
    ]);
    expect(embeddedSlots).toEqual(["embedded.conversation"]);
    expect(platformSlots).toContain("agent-conversations");
    expect(assistantSlots).not.toContain("agent-conversations");
    expect(
      agentUIModeRegistry.get("platform").createInitialAppUIModel(),
    ).toEqual(currentAppUIModel);
  });
});
