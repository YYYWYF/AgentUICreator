import type { UpdateSourceProvider } from "./source-catalog/index.js";
import type { UpdateInspection, UpgradePlan } from "./update-contract.js";
export type { UpdateInspection, UpgradePlan, PluginUpdate, UpdateCompatibility } from "./update-contract.js";
export type { UpdateSourceProvider, ReleaseDescriptor, ResolvedSourceRelease } from "./source-catalog/index.js";
export { InstalledUpdateSourceProvider, MockUpdateSourceProvider } from "./source-catalog/index.js";
export declare class AgentUIUpdateService {
  constructor(provider?: UpdateSourceProvider, creatorVersion?: string, supportedContractVersion?: number);
  inspect(projectRoot: string, options?: { readOnly?: boolean }): Promise<UpdateInspection>;
  plan(projectRoot: string, pluginIds: string[], releaseVersion: string): Promise<UpgradePlan>;
  execute(projectRoot: string, planId: string): Promise<{ updatedItems: string[]; adopted: boolean }>;
  merge(projectRoot: string, planId: string): Promise<{ planId: string; prompt: string; files: { itemId: string; path: string; base: string | null; local: string | null; target: string | null }[] }>;
  startManualMerge(projectRoot: string, planId: string): Promise<{ planId: string; files: string[] }>;
  adopt(projectRoot: string, planId: string): Promise<{ updatedItems: string[]; adopted: boolean }>;
}

export { PackageUpdateService } from "./updates/package-update-service.js";
export type { PackageUpdateOverview, PackageVersionUpdate, PackageCompatibilityIssue } from "./updates/package-update-service.js";
export { HttpCompatibilityReleaseProvider } from "./updates/release-provider.js";
export type { CompatibilityReleaseProvider, ReleaseDiscovery } from "./updates/release-provider.js";
export { parseCompatibilityManifest, compatibilityManifestSchema } from "./updates/compatibility-release.js";
export type { CompatibilityManifest, CompatibilityRelease } from "./updates/compatibility-release.js";

export { PackageUpgradeService } from "./updates/package-upgrade-service.js";
export type { PackageUpgradePlan, PackageUpgradeResult } from "./updates/package-upgrade-service.js";

export { NpmCompatibilityReleaseProvider } from "./updates/npm-release-provider.js";
