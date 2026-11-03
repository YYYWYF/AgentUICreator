export const AGENT_UI_MODES = ["assistant", "embedded", "platform"] as const;
export type AgentUIMode = (typeof AGENT_UI_MODES)[number];

export interface AgentUIModeDefinition {
  readonly id: AgentUIMode;
  readonly workspace: {
    readonly regions: Readonly<Partial<Record<"left" | "center" | "right", { readonly required: boolean; readonly track: number | string }>>>;
  };
  readonly defaultPresetId: string;
}

/** AppUIModel remains a generated-project contract; bootstrap stores JSON data only. */
export interface AgentUIPresetDefinition<TModel = unknown> {
  readonly id: string;
  readonly mode: AgentUIMode;
  readonly sourceItems?: readonly string[];
  createAppUIModel(): TModel;
}

export class AgentUIModeRegistry {
  private readonly definitions = new Map<AgentUIMode, AgentUIModeDefinition>();

  register(definition: AgentUIModeDefinition): void {
    if (this.definitions.has(definition.id)) throw new Error(`Agent UI Mode "${definition.id}" is already registered.`);
    this.definitions.set(definition.id, definition);
  }

  get(mode: AgentUIMode): AgentUIModeDefinition {
    const definition = this.definitions.get(mode);
    if (definition === undefined) throw new Error(`Agent UI Mode "${mode}" is not registered.`);
    return definition;
  }

  has(mode: AgentUIMode): boolean { return this.definitions.has(mode); }

  list(): readonly AgentUIModeDefinition[] {
    return Object.freeze([...this.definitions.values()]);
  }
}

export class AgentUIPresetRegistry<TModel = unknown> {
  private readonly definitions = new Map<string, AgentUIPresetDefinition<TModel>>();

  register(definition: AgentUIPresetDefinition<TModel>): void {
    if (this.definitions.has(definition.id)) throw new Error(`Agent UI Preset "${definition.id}" is already registered.`);
    this.definitions.set(definition.id, definition);
  }

  get(id: string): AgentUIPresetDefinition<TModel> {
    const definition = this.definitions.get(id);
    if (definition === undefined) throw new Error(`Agent UI Preset "${id}" is not registered.`);
    return definition;
  }

  getDefaultForMode(mode: AgentUIMode, modes: AgentUIModeRegistry): AgentUIPresetDefinition<TModel> {
    const preset = this.get(modes.get(mode).defaultPresetId);
    if (preset.mode !== mode) throw new Error(`Default preset "${preset.id}" belongs to Mode "${preset.mode}", not "${mode}".`);
    return preset;
  }

  list(): readonly AgentUIPresetDefinition<TModel>[] {
    return Object.freeze([...this.definitions.values()]);
  }
}

export const assistantMode: AgentUIModeDefinition = {
  id: "assistant", workspace: { regions: { center: { required: true, track: "minmax(0, 1fr)" } } },
  defaultPresetId: "assistant/default",
};
export const embeddedMode: AgentUIModeDefinition = {
  id: "embedded", workspace: { regions: { center: { required: true, track: "minmax(0, 1fr)" } } },
  defaultPresetId: "embedded/default",
};
export const platformMode: AgentUIModeDefinition = {
  id: "platform", workspace: { regions: {
    left: { required: false, track: "280px" },
    center: { required: true, track: "minmax(0, 1fr)" },
    right: { required: false, track: "280px" },
  } }, defaultPresetId: "platform/default",
};

export function createAgentUIModeRegistry(): AgentUIModeRegistry {
  const registry = new AgentUIModeRegistry();
  for (const mode of [assistantMode, embeddedMode, platformMode]) registry.register(mode);
  return registry;
}

export const agentUIModeRegistry = createAgentUIModeRegistry();

export function createAgentUIPresetRegistry<TModel>(
  models: Readonly<Record<AgentUIMode, TModel>>,
  sourceItems: Readonly<Record<AgentUIMode, readonly string[]>>,
): AgentUIPresetRegistry<TModel> {
  const registry = new AgentUIPresetRegistry<TModel>();
  for (const mode of AGENT_UI_MODES) {
    registry.register({
      id: `${mode}/default`, mode, sourceItems: sourceItems[mode],
      createAppUIModel: () => structuredClone(models[mode]),
    });
  }
  return registry;
}
