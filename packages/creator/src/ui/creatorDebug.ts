export interface CreatorDebugLocation {
  hostname: string;
  search: string;
}

/** Creator diagnostics require an explicit URL opt-in, including on local hosts. */
export function resolveCreatorDebugMode({
  search,
}: CreatorDebugLocation): boolean {
  const explicitValue = new URLSearchParams(search).get("creatorDebug");
  if (explicitValue === null) {
    return false;
  }
  const normalized = explicitValue.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}
