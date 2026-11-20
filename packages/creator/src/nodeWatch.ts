import type { ServerOptions } from "vite";

/** Early Node 20 can lose native macOS file events; keep explicit Host choices. */
export function creatorWatchOptions(
  watch: ServerOptions["watch"],
  platform = process.platform,
  nodeVersion = process.versions.node,
): ServerOptions["watch"] {
  if (watch === null || watch?.usePolling !== undefined || platform !== "darwin" || !/^20\.(?:[0-9]|10|11)\./u.test(nodeVersion)) return watch;
  return { ...watch, usePolling: true };
}
