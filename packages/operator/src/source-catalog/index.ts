export {
  DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT,
  loadAgentUISourceRegistry,
} from "./loader.js";
export {
  AgentUISourceRegistryError,
  MAX_AGENT_UI_SOURCE_FILE_BYTES,
  MAX_AGENT_UI_SOURCE_FILES,
  MAX_AGENT_UI_SOURCE_ITEM_BYTES,
  assertSafeRegistryRelativePath,
  parseRegistryManifest,
  parseSourceItem,
} from "@za38.03/agent-ui-plugins/catalog";
export type {
  AgentUISourceFile,
  AgentUISourceItem,
  AgentUISourceItemKind,
  AgentUISourceUpstream,
  AgentUISourceRegistryManifest,
  LoadedAgentUISourceFile,
  LoadedAgentUISourceItem,
  LoadedAgentUISourceRegistry,
} from "@za38.03/agent-ui-plugins/catalog";
export { resolveAgentUISourceItemClosure } from "@za38.03/agent-ui-plugins/catalog";
export { isAgentUISourceItemAvailable, isOptionalAgentUISourceItem } from "@za38.03/agent-ui-plugins/catalog";
export { OfficialResourceError } from "@za38.03/agent-ui-plugins/catalog";
export type { OfficialAgentUIResource } from "@za38.03/agent-ui-plugins/catalog";
export { createOfficialResourceRegistry, officialResourceRegistry, resolveOfficialResource, validateOfficialResourceSources } from "@za38.03/agent-ui-plugins/catalog";
export { InstalledUpdateSourceProvider, MockUpdateSourceProvider, comparePluginVersions, parseReleaseDescriptor, resolveSourceRelease, verifySourceRelease, pluginSourceDigest } from "./release.js";
export type { UpdateSourceProvider, ReleaseDescriptor, ResolvedSourceRelease, ChangelogEntry } from "./release.js";

export { officialPackagePlugins, officialPackagePlugin } from "@za38.03/agent-ui-plugins/catalog";
