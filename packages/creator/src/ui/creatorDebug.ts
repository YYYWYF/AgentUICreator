export interface CreatorDebugLocation {
  hostname: string;
  search: string;
}

function isLocalCreatorHost(hostname: string): boolean {
  return hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]";
}

/** Resolve the presentation-only Creator debug flag from the current URL. */
export function resolveCreatorDebugMode({
  hostname,
  search,
}: CreatorDebugLocation): boolean {
  const explicitValue = new URLSearchParams(search).get("creatorDebug");
  if (explicitValue !== null) {
    const normalized = explicitValue.trim().toLowerCase();
    if (normalized === "1" || normalized === "true") {
      return true;
    }
    if (normalized === "0" || normalized === "false") {
      return false;
    }
  }
  return isLocalCreatorHost(hostname);
}
