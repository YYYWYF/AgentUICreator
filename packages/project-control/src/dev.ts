export { inspectCreatorProject } from "./project/creator-project-inspector";
export { createAgentUIInitializationHost } from "./project/bootstrap-host";
export { handleUIProjectControlRequest, runUIProjectControlCli } from "./handler";
export { verifyUIProject, runUIProjectVerificationCli } from "./verify-ui";
export { installDemoPlugin } from "./project/install-demo-plugin";
export { installMockResource, installScenarioResources, inspectScenarioResources } from "./project/install-scenario-resources";
export type { OfficialResourceInstallResult } from "./project/install-official-agent-ui-resource";
export { installOfficialAgentUIResource } from "./project/install-official-agent-ui-resource";
export { inspectOfficialResourceImplementation, inspectOfficialAgentUIResourceCatalog } from "./project/official-resource-inspection";
export type { ResourceCompositionInspection, ResourceSourceInspection } from "./project/official-resource-inspection";
export { officialResourceRegistry, resolveOfficialResource, OfficialResourceError } from "@agent-ui/source-registry";
export { mergeOptionalResourceInspection } from "./project/optional-resource-paths";
export type { AgentUISourceInspection, UICompositionInspection } from "./project/types";
export { AgentUIUpdateService } from "./project/source-registry/updates";
export type { UpdateInspection, PluginUpdate, UpgradePlan, UpdateCompatibility } from "./project/source-registry/updates";
export { MockUpdateSourceProvider } from "@agent-ui/source-registry";
export type { UpdateSourceProvider, ReleaseDescriptor, ResolvedSourceRelease } from "@agent-ui/source-registry";
export { getAvailableAgentUIThemes, setAgentUITheme } from "./project/agent-ui-theme";
export type { ThemeCatalog, ThemeChange } from "./project/agent-ui-theme";

export { synchronizeAgentUIPluginRegistry } from "./project/synchronize-plugin-registry";

export { inspectIntegrationHost, planIntegrationRecipe, applyIntegrationRecipe, prepareIntegrationRecipeAsset, verifyIntegrationRecipe } from "./project/integration-recipe";
export type { IntegrationRecipe, IntegrationOptions } from "./project/integration-recipe";

export { createCustomPlugin } from "./project/create-custom-plugin";
export { migrateOfficialPackagePlugin } from "./project/migrate-official-package-plugin";
