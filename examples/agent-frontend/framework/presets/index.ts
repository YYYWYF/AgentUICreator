import { AgentUIPresetRegistry } from "./AgentUIPresetRegistry";
import { assistantDefaultPreset } from "./assistant";
import { embeddedDefaultPreset } from "./embedded";
import { platformDefaultPreset } from "./platform";

export * from "./AgentUIPresetRegistry";
export * from "./types";
export * from "./assistant";
export * from "./embedded";
export * from "./platform";

export function createAgentUIPresetRegistry(): AgentUIPresetRegistry {
  const registry = new AgentUIPresetRegistry();
  registry.register(assistantDefaultPreset);
  registry.register(embeddedDefaultPreset);
  registry.register(platformDefaultPreset);
  return registry;
}

export const agentUIPresetRegistry = createAgentUIPresetRegistry();
