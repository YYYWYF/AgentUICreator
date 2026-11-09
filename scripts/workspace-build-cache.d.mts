export const hostPackages: string[];
export function isDevelopmentInput(relative: string, generated?: Set<string>): boolean;
export function packageSourceFingerprint(root: string): string;
export function workspacePackageFingerprints(packages: string[], options?: { root?: string }): string[];
export function prepareWorkspacePackagesAsync(packages: string[], build: (name: string) => Promise<boolean>, options?: { root?: string }): Promise<string[]>;
