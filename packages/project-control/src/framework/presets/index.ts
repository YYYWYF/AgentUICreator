import { createDefaultAgentUIPresetRegistry } from "@agent-ui/bootstrap";
import { parseAppUIModel } from "../contracts/app-ui-model";

export * from "./AgentUIPresetRegistry";
export * from "./types";

export function createAgentUIPresetRegistry() {
  return createDefaultAgentUIPresetRegistry(parseAppUIModel);
}

export const agentUIPresetRegistry = createAgentUIPresetRegistry();
export const assistantDefaultPreset = agentUIPresetRegistry.get("assistant/default");
export const embeddedDefaultPreset = agentUIPresetRegistry.get("embedded/default");
export const platformDefaultPreset = agentUIPresetRegistry.get("platform/default");
