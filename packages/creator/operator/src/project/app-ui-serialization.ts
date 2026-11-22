import { createHash } from "node:crypto";
import {
  assignGeneratedAppUIIds,
  hasGeneratedAppUIId,
  stripGeneratedAppUIIds,
  type AppUIModel,
} from "../framework/contracts/app-ui-model";

/** Recover copied runtime identities from the checked authoring source, never an ID prefix. */
export function stripCopiedAppUIIds(value: unknown, originalSource: string): unknown {
  let original: unknown;
  try { original = JSON.parse(originalSource); }
  catch { return stripGeneratedAppUIIds(value); }

  // Recovery may start from schema-invalid JSON. Supply only the omitted Plugin
  // identity defaults, then let the canonical generator derive the same IDs.
  const withIdentityDefaults = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(withIdentityDefaults);
    if (current === null || typeof current !== "object") return current;
    const record = Object.fromEntries<unknown>(Object.entries(current as Record<string, unknown>)
      .map(([key, child]) => [key, withIdentityDefaults(child)]));
    if (typeof record.pluginId === "string" && record.id === undefined) record.id = "";
    return record;
  };
  const generatedIds = new Set<string>();
  const collect = (current: unknown): void => {
    if (current === null || typeof current !== "object") return;
    if (!Array.isArray(current)) {
      const record = current as Record<string, unknown>;
      if (hasGeneratedAppUIId(current) && typeof record.id === "string" && typeof record.pluginId === "string") {
        generatedIds.add(record.id);
      }
    }
    Object.values(current as Record<string, unknown>).forEach(collect);
  };
  collect(assignGeneratedAppUIIds(withIdentityDefaults(original)));

  const strip = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(strip);
    if (current === null || typeof current !== "object") return current;
    const record = current as Record<string, unknown>;
    // Replacing the implementation does not turn a copied derived ID explicit.
    const copied = typeof record.id === "string" && typeof record.pluginId === "string" && generatedIds.has(record.id);
    return Object.fromEntries<unknown>(Object.entries(record)
      .filter(([key]) => key !== "id" || !copied)
      .map(([key, child]) => [key, strip(child)]));
  };
  return strip(stripGeneratedAppUIIds(value));
}

/** Persist only non-default enablement; parsed models keep explicit booleans. */
export function stringifyAppUIModel(model: AppUIModel): string {
  return `${JSON.stringify(stripGeneratedAppUIIds(model), (key, value: unknown) =>
    key === "enabled" && value === true ? undefined : value, 2)}\n`;
}

/** Standard JSON imports discard whitespace; preserve the raw hash for write admission. */
export function appUIModelJsonHash(source: string): string {
  return createHash("sha256").update(JSON.stringify(JSON.parse(source))).digest("hex");
}
