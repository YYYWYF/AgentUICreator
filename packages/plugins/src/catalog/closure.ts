import { AgentUISourceRegistryError } from "./schema.js";
import type { LoadedAgentUISourceItem, LoadedAgentUISourceRegistry } from "./types.js";

/** Dependency-first closure including the requested item; pure and deterministic. */
export function resolveAgentUISourceItemClosure(registry: LoadedAgentUISourceRegistry, itemId: string): LoadedAgentUISourceItem[] {
  const result: LoadedAgentUISourceItem[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(id: string, parent?: string): void {
    if (visiting.has(id)) throw new AgentUISourceRegistryError("AGENT_UI_SOURCE_REQUIREMENT_CYCLE", `Source item requirement cycle at ${id}.`);
    if (visited.has(id)) return;
    const item = registry.byId.get(id);
    if (!item) throw new AgentUISourceRegistryError(parent ? "AGENT_UI_SOURCE_REQUIREMENT_NOT_FOUND" : "AGENT_UI_SOURCE_ITEM_NOT_FOUND", parent ? `${parent} requires unavailable item ${id}.` : `Source item ${id} does not exist.`);
    visiting.add(id);
    for (const dependency of item.requires ?? []) visit(dependency, id);
    visiting.delete(id);
    visited.add(id);
    result.push(item);
  }
  visit(itemId);
  return result;
}
