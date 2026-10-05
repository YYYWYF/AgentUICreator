export type UpdateCompatibility = "compatible" | "creator-upgrade-required" | "unsupported";
export interface PluginUpdate {
  pluginId: string; name: string; currentVersion: string | null; targetVersion: string; sourceRelease: string | null;
  status: string; updateAvailable: boolean; changelog: { version: string; entry: import("@agent-ui/source-registry").ChangelogEntry }[];
}
export interface UpdateInspection { releaseVersion: string; compatibility: UpdateCompatibility; fingerprint: string; plugins: PluginUpdate[] }
export interface UpgradePlan {
  id: string; releaseVersion: string; compatibility: UpdateCompatibility; requestedPlugins: string[];
  items: { itemId: string; status: string; changed: boolean; provided: boolean; currentVersion: string | null; targetVersion: string | null; paths: string[] }[];
  fileCount: number; requiresMerge: boolean; blocked: boolean; issues: string[];
}
