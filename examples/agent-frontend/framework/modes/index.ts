import { AgentUIModeRegistry } from "./AgentUIModeRegistry";
import { assistantMode } from "./assistant";
import { embeddedMode } from "./embedded";
import { platformMode } from "./platform";

export * from "./AgentUIModeRegistry";
export * from "./assistant";
export * from "./embedded";
export * from "./platform";

export function createAgentUIModeRegistry(): AgentUIModeRegistry {
  const registry = new AgentUIModeRegistry();
  registry.register(assistantMode);
  registry.register(embeddedMode);
  registry.register(platformMode);
  return registry;
}

export const agentUIModeRegistry = createAgentUIModeRegistry();
