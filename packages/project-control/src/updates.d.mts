import type { UpdateSourceProvider } from "@agent-ui/source-registry";
import type { UpdateInspection, UpgradePlan } from "./update-contract.js";
export type { UpdateInspection, UpgradePlan, PluginUpdate, UpdateCompatibility } from "./update-contract.js";
export type { UpdateSourceProvider, ReleaseDescriptor, ResolvedSourceRelease } from "@agent-ui/source-registry";
export { MockUpdateSourceProvider } from "@agent-ui/source-registry";
export declare class AgentUIUpdateService {
  constructor(provider?: UpdateSourceProvider, creatorVersion?: string, supportedContractVersion?: number);
  inspect(projectRoot: string): Promise<UpdateInspection>;
  plan(projectRoot: string, pluginIds: string[], releaseVersion: string): Promise<UpgradePlan>;
  execute(projectRoot: string, planId: string): Promise<{ updatedItems: string[]; adopted: boolean }>;
  merge(projectRoot: string, planId: string): Promise<{ planId: string; prompt: string; files: { itemId: string; path: string; base: string | null; local: string | null; target: string | null }[] }>;
  startManualMerge(projectRoot: string, planId: string): Promise<{ planId: string; files: string[] }>;
  adopt(projectRoot: string, planId: string): Promise<{ updatedItems: string[]; adopted: boolean }>;
}
