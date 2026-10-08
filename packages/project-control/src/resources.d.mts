import type { OfficialAgentUIResource } from "@agent-ui/source-registry";
export { officialResourceRegistry, resolveOfficialResource, OfficialResourceError } from "@agent-ui/source-registry";

/** Node-compatible development API; implementation details stay out of UI DTOs. */
export interface ResourcePackageRequirement {
  name: string;
  required: string;
  declared?: string;
  installed?: string;
  compatible: boolean;
}
export interface ResourceCompositionInspection {
  pluginSources: readonly { pluginId: string; status: "available" | "missing"; dataMessageUINames: readonly string[] }[];
  pluginInstances: readonly { id: string; pluginId: string; enabled: boolean; effectiveEnabled: boolean; target: { type: string; parentInstanceId?: string; slot?: string } }[];
}
export interface ResourceSourceItemInspection {
  id: string;
  status: string;
  owned: boolean;
  updateAvailable?: boolean;
  resolvedRequirements?: readonly ResourcePackageRequirement[];
  dependencies?: readonly string[];
  dependencyIssues?: readonly { code: string }[];
  issues?: readonly { code: string }[];
}
export interface ResourceSourceInspection {
  integrationRegistryReady?: boolean;
  items: readonly ResourceSourceItemInspection[];
}
export interface ResourceImplementationInspection {
  status: "ready" | "missing" | "disabled" | "conflict";
  implementation: OfficialAgentUIResource["implementation"];
  source: ResourceSourceItemInspection | undefined;
  closure: (ResourceSourceItemInspection | undefined)[];
  packages: ResourcePackageRequirement[];
  conflicts: ResourcePackageRequirement[];
}
export interface ResourcePackageCommand { command: string; args: string[] }
export type ResourcePackageRunner = (projectRoot: string, command: ResourcePackageCommand) => Promise<void>;

export function inspectOfficialResourceImplementation(resource: OfficialAgentUIResource, composition: ResourceCompositionInspection, sources: ResourceSourceInspection): ResourceImplementationInspection;
export function inspectScenarioResources(projectRoot: string): Promise<ResourceSourceInspection>;
export function mergeOptionalResourceInspection<T extends ResourceSourceInspection>(normal: T, resources: ResourceSourceInspection): Promise<T>;
export function installOfficialAgentUIResource(projectRoot: string, resourceId: string, options?: { runPackages?: ResourcePackageRunner }): Promise<OfficialResourceInstallResult>;

export interface OfficialResourceCatalogEntry { id: string; label: string; description?: string; status: "ready" | "missing" | "disabled" | "conflict"; installable: boolean }
export interface OfficialResourceInstallResult { resourceId: string; changed: boolean; reenabled: boolean; verification?: { status: "passed" | "failed"; errors: unknown[]; warnings: unknown[] } }
export function inspectOfficialAgentUIResourceCatalog(root: string): Promise<OfficialResourceCatalogEntry[]>;

export { inspectIntegrationHost, planIntegrationRecipe, applyIntegrationRecipe, prepareIntegrationRecipeAsset, verifyIntegrationRecipe } from "./project/integration-recipe";
export type { IntegrationRecipe, IntegrationOptions } from "./project/integration-recipe";

export function migrateOfficialPackagePlugin(projectRoot: string, pluginId?: "assistant-ui-composer"): Promise<{ changed: boolean }>;
