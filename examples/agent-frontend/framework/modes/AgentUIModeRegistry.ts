import type {
  AgentUIMode,
  AgentUIModeDefinition,
} from "../contracts/agent-ui-mode";

export class AgentUIModeRegistry {
  private readonly definitions = new Map<AgentUIMode, AgentUIModeDefinition>();

  register(definition: AgentUIModeDefinition): void {
    if (this.definitions.has(definition.id)) {
      throw new Error(`Agent UI Mode "${definition.id}" is already registered.`);
    }
    this.definitions.set(definition.id, definition);
  }

  get(mode: AgentUIMode): AgentUIModeDefinition {
    const definition = this.definitions.get(mode);
    if (definition === undefined) {
      throw new Error(`Agent UI Mode "${mode}" is not registered.`);
    }
    return definition;
  }

  has(mode: AgentUIMode): boolean {
    return this.definitions.has(mode);
  }

  list(): readonly AgentUIModeDefinition[] {
    return Object.freeze([...this.definitions.values()]);
  }
}
