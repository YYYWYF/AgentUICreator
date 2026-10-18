export { inspectCreatorProject } from "./project/creator-project-inspector";
export { createAgentUIInitializationHost } from "./project/bootstrap-host";
export { handleUIOperatorRequest, runUIOperatorCli } from "./handler";
export { verifyUIProject, runUIProjectVerificationCli } from "./verify-ui";
export { installDemoPlugin } from "./project/install-demo-plugin";
export { installMockResource, installScenarioResources, inspectScenarioResources } from "./project/install-scenario-resources";
export type { OfficialResourceInstallResult } from "./project/install-official-agent-ui-resource";
export { installOfficialAgentUIResource } from "./project/install-official-agent-ui-resource";
export { inspectOfficialResourceImplementation, inspectOfficialAgentUIResourceCatalog } from "./project/official-resource-inspection";
export type { ResourceCompositionInspection, ResourceSourceInspection } from "./project/official-resource-inspection";
export { officialResourceRegistry, resolveOfficialResource, OfficialResourceError } from "./source-catalog/index.js";
export { mergeOptionalResourceInspection } from "./project/optional-resource-paths";
export type { AgentUISourceInspection, UICompositionInspection } from "./project/types";
export { AgentUIUpdateService } from "./project/source-registry/updates";
export type { UpdateInspection, PluginUpdate, UpgradePlan, UpdateCompatibility } from "./project/source-registry/updates";
export { InstalledUpdateSourceProvider, MockUpdateSourceProvider } from "./source-catalog/index.js";
export type { UpdateSourceProvider, ReleaseDescriptor, ResolvedSourceRelease } from "./source-catalog/index.js";
export { getAvailableAgentUIThemes, setAgentUITheme } from "./project/agent-ui-theme";
export type { ThemeCatalog, ThemeChange } from "./project/agent-ui-theme";

export { synchronizeAgentUIPluginRegistry } from "./project/synchronize-plugin-registry";

export { inspectIntegrationHost, planIntegrationRecipe, applyIntegrationRecipe, prepareIntegrationRecipeAsset, verifyIntegrationRecipe } from "./project/integration-recipe";
export type { IntegrationRecipe, IntegrationOptions } from "./project/integration-recipe";

export { createCustomPlugin } from "./project/create-custom-plugin";
export { migrateOfficialPackagePlugin } from "./project/migrate-official-package-plugin";

export { ensurePluginApplication } from "./project/plugin-application";
export { planPluginSourceSync, syncPluginSource } from "./project/takeover-plugin-source";

export { PackageUpdateService } from "./updates/package-update-service";
export type { PackageUpdateOverview, PackageVersionUpdate, PackageCompatibilityIssue } from "./updates/package-update-service";
export { HttpCompatibilityReleaseProvider } from "./updates/release-provider";
export type { CompatibilityReleaseProvider, ReleaseDiscovery } from "./updates/release-provider";
export { parseCompatibilityManifest, compatibilityManifestSchema } from "./updates/compatibility-release";
export type { CompatibilityManifest, CompatibilityRelease } from "./updates/compatibility-release";

export { PackageUpgradeService } from "./updates/package-upgrade-service.js";
export type { PackageUpgradePlan, PackageUpgradeResult } from "./updates/package-upgrade-service.js";

export { NpmCompatibilityReleaseProvider } from "./updates/npm-release-provider.js";

export { planCompatibilityProject, initializeCompatibilityProject, buildCompatibilityProject } from "./project/compatibility-project";
export { readCompatibilityBinding, resolveCompatibilityConsumer } from "./project/compatibility-binding";
