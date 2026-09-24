import { describe, expect, it } from "vitest";

import {
  AGENT_UI_MODES,
  parseAgentUIMode,
  type AgentUIModeDefinition,
} from "../framework/contracts/agent-ui-mode";
import {
  AgentUIModeRegistry,
  agentUIModeRegistry,
} from "../framework/modes";
import { assistantMode } from "../framework/modes/assistant";
import { embeddedMode } from "../framework/modes/embedded";
import { platformMode } from "../framework/modes/platform";

describe("Agent UI Mode", () => {
  it("accepts the three formal Modes in canonical order", () => {
    expect(AGENT_UI_MODES).toEqual(["assistant", "embedded", "platform"]);
    for (const mode of AGENT_UI_MODES) {
      expect(parseAgentUIMode(mode)).toBe(mode);
    }
    expect(() => parseAgentUIMode("floating")).toThrow();
  });

  it("registers all built-in Modes in deterministic order", () => {
    expect(agentUIModeRegistry.list().map((definition) => definition.id)).toEqual([
      "assistant",
      "embedded",
      "platform",
    ]);
    for (const mode of AGENT_UI_MODES) {
      expect(agentUIModeRegistry.has(mode)).toBe(true);
      expect(agentUIModeRegistry.get(mode).id).toBe(mode);
    }
  });

  it("keeps Mode definitions limited to workspace policy and default preset", () => {
    expect(assistantMode).toMatchObject({
      id: "assistant",
      defaultPresetId: "assistant/default",
      workspace: { regions: { center: { required: true } } },
    });
    expect(Object.keys(assistantMode.workspace.regions)).toEqual(["center"]);
    expect(embeddedMode).toMatchObject({
      id: "embedded",
      defaultPresetId: "embedded/default",
      workspace: { regions: { center: { required: true } } },
    });
    expect(Object.keys(embeddedMode.workspace.regions)).toEqual(["center"]);
    expect(platformMode.defaultPresetId).toBe("platform/default");
    expect(Object.keys(platformMode.workspace.regions)).toEqual([
      "left",
      "center",
      "right",
    ]);
  });

  it("rejects unknown lookups and duplicate registrations", () => {
    const registry = new AgentUIModeRegistry();
    const definition: AgentUIModeDefinition = {
      id: "platform",
      workspace: platformMode.workspace,
      defaultPresetId: "platform/default",
    };
    registry.register(definition);

    expect(() => registry.register(definition)).toThrow("already registered");
    expect(() =>
      registry.get("unknown" as Parameters<AgentUIModeRegistry["get"]>[0]),
    ).toThrow("not registered");
  });
});
