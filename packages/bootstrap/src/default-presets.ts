import { readFileSync } from "node:fs";

import {
  AGENT_UI_MODES,
  AgentUIPresetRegistry,
  type AgentUIMode,
  type AgentUIPresetDefinition,
} from "./project-definition.js";

function readPreset(mode: AgentUIMode): unknown {
  return JSON.parse(readFileSync(new URL(`../presets/${mode}/app-ui.json`, import.meta.url), "utf8")) as unknown;
}

function collectPluginIds(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectPluginIds(entry, ids);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const record = value as Record<string, unknown>;
  if (typeof record.pluginId === "string") ids.add(record.pluginId);
  for (const child of Object.values(record)) collectPluginIds(child, ids);
}

export function createDefaultAgentUIPresetRegistry<TModel>(
  parseAppUIModel: (input: unknown) => TModel,
): AgentUIPresetRegistry<TModel> {
  const registry = new AgentUIPresetRegistry<TModel>();
  for (const mode of AGENT_UI_MODES) {
    const model = readPreset(mode);
    const pluginIds = new Set<string>();
    collectPluginIds(model, pluginIds);
    const definition: AgentUIPresetDefinition<TModel> = {
      id: `${mode}/default`,
      mode,
      sourceItems: [
        "foundation/core",
        "foundation/conversation",
        ...[...pluginIds].sort().map((id) => `plugin/${id}`),
      ],
      createAppUIModel: () => parseAppUIModel(structuredClone(model)),
    };
    registry.register(definition);
  }
  return registry;
}
