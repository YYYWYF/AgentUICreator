import {
  collectAppUIPluginLocations,
  hasGeneratedAppUIId,
  type AppUIModel,
} from "../framework/contracts/app-ui-model";

/** References belong to one inspected model, never to persisted application state. */
export function appUIPluginRefs(model: AppUIModel) {
  const locations = collectAppUIPluginLocations(model);
  const occupied = new Set(locations.map(({ plugin }) => plugin.id));
  const byRef = new Map<string, string>();
  const byId = new Map<string, string>();
  let index = 0;
  for (const { plugin } of locations) {
    if (!hasGeneratedAppUIId(plugin)) continue;
    let ref: string;
    do { ref = `p${index++}`; } while (occupied.has(ref));
    byRef.set(ref, plugin.id);
    byId.set(plugin.id, ref);
  }
  return { byRef, byId };
}

export function withCreatorPluginRefs<T>(value: T, model: AppUIModel): T {
  const { byId } = appUIPluginRefs(model);
  return remapPluginIdentities(value, byId);
}

/** Translate observation/receipt identities without changing Plugin definition IDs. */
export function remapPluginIdentities<T>(value: T, byId: ReadonlyMap<string, string>): T {
  const visit = (current: unknown, key = ""): unknown => {
    if (typeof current === "string") return key === "pluginId" ? current : byId.get(current) ?? current;
    if (Array.isArray(current)) return current.map(child => visit(child, key));
    if (current === null || typeof current !== "object") return current;
    return Object.fromEntries(Object.entries(current).map(([name, child]) => [
      byId.get(name) ?? name, visit(child, name),
    ]));
  };
  return visit(value) as T;
}

export function resolveCreatorPluginRefs<T>(value: T, model: AppUIModel): T {
  const { byRef } = appUIPluginRefs(model);
  const referenceKeys = new Set(["instanceId", "parentInstanceId", "anchorInstanceId", "replaceInstanceId"]);
  const visit = (current: unknown, key = ""): unknown => {
    if (typeof current === "string") return referenceKeys.has(key) ? byRef.get(current) ?? current : current;
    if (Array.isArray(current)) return current.map(child => visit(child, key));
    if (current === null || typeof current !== "object") return current;
    // Keep inserted nodes and their generated-identity provenance intact.
    if ("pluginId" in current && "id" in current) return current;
    return Object.fromEntries(Object.entries(current).map(([name, child]) => [name, visit(child, name)]));
  };
  return visit(value) as T;
}
