export function workspaceDevelopmentId(
  root: string,
  platform?: NodeJS.Platform,
): string;
export function acquireDevelopmentSession(
  root: string,
  options?: { scope?: string; base?: string },
): () => void;
export function openDevelopmentCache(
  root: string,
  role: string,
  inputs: string[],
  options?: { base?: string; warn?: (message: string) => void },
): {
  cacheDir: string;
  reused: boolean;
  finish(clean?: boolean): void;
};
