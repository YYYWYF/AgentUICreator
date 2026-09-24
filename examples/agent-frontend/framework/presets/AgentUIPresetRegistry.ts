import type { AgentUIMode } from "../contracts/agent-ui-mode";
import type { AgentUIModeRegistry } from "../modes/AgentUIModeRegistry";
import type { AgentUIPresetDefinition } from "./types";

export class AgentUIPresetRegistry {
  private readonly definitions = new Map<string, AgentUIPresetDefinition>();

  register(definition: AgentUIPresetDefinition): void {
    if (this.definitions.has(definition.id)) {
      throw new Error(`Agent UI Preset "${definition.id}" is already registered.`);
    }
    this.definitions.set(definition.id, definition);
  }

  get(id: string): AgentUIPresetDefinition {
    const definition = this.definitions.get(id);
    if (definition === undefined) {
      throw new Error(`Agent UI Preset "${id}" is not registered.`);
    }
    return definition;
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  list(): readonly AgentUIPresetDefinition[] {
    return Object.freeze([...this.definitions.values()]);
  }

  getDefaultForMode(
    mode: AgentUIMode,
    modeRegistry: AgentUIModeRegistry,
  ): AgentUIPresetDefinition {
    const modeDefinition = modeRegistry.get(mode);
    const preset = this.get(modeDefinition.defaultPresetId);
    if (preset.mode !== mode) {
      throw new Error(
        `Default preset "${preset.id}" belongs to Mode "${preset.mode}", not "${mode}".`,
      );
    }
    return preset;
  }
}
