export type UpdateCompatibility = "compatible" | "creator-upgrade-required" | "unsupported";
export interface PluginUpdate {
  delivery?: "source-owned"; packageVersion?: string;
  pluginId: string; name: string; currentVersion: string | null; targetVersion: string; sourceRelease: string | null;
  status: string; updateAvailable: boolean; changelog: { version: string; entry: import("./source-catalog/index.js").ChangelogEntry }[];
}
export interface UpdateInspection { packageUpdates?: import("./updates/package-update-service.js").PackageUpdateOverview; releaseVersion: string; compatibility: UpdateCompatibility; fingerprint: string; plugins: PluginUpdate[] }
export interface UpgradePlan {
  kind?: "owned-source";
  id: string; releaseVersion: string; compatibility: UpdateCompatibility; requestedPlugins: string[];
  items: { itemId: string; reason: "requested" | "dependency"; requiredBy: string[]; status: string; changed: boolean; provided: boolean; currentVersion: string | null; targetVersion: string | null; paths: string[] }[];
  fileCount: number; requiresMerge: boolean; blocked: boolean; issues: string[];
}
