import { createHash } from "node:crypto";
import { stripGeneratedAppUIIds, type AppUIModel } from "../framework/contracts/app-ui-model";

/** Persist only non-default enablement; parsed models keep explicit booleans. */
export function stringifyAppUIModel(model: AppUIModel): string {
  return `${JSON.stringify(stripGeneratedAppUIIds(model), (key, value: unknown) =>
    key === "enabled" && value === true ? undefined : value, 2)}\n`;
}

/** Standard JSON imports discard whitespace; preserve the raw hash for write admission. */
export function appUIModelJsonHash(source: string): string {
  return createHash("sha256").update(JSON.stringify(JSON.parse(source))).digest("hex");
}
