export function workspaceDevelopmentId(
  root: string,
  platform?: NodeJS.Platform,
): string;
export function prepareDevelopmentCache(
  root: string,
  role: "workbench" | "host-preview",
  options?: {
    /** Parent directory for development caches; defaults to root/node_modules/.cache. */
    base?: string;
    warn?: (message: string) => void;
    remove?: typeof import("node:fs").rmSync;
  },
): string;
