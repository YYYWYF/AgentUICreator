import { AgentUIModeRegistry } from "./AgentUIModeRegistry";
import { platformMode } from "./platform";

export * from "./AgentUIModeRegistry";
export * from "./platform";

export function createAgentUIModeRegistry(): AgentUIModeRegistry {
  const registry = new AgentUIModeRegistry();
  registry.register(platformMode);
  return registry;
}

export const agentUIModeRegistry = createAgentUIModeRegistry();
