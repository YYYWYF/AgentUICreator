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
} from "./schema.js";
export type {
  AgentUISourceFile,
  AgentUISourceItem,
  AgentUISourceItemKind,
  AgentUISourceUpstream,
  AgentUISourceRegistryManifest,
  LoadedAgentUISourceFile,
  LoadedAgentUISourceItem,
  LoadedAgentUISourceRegistry,
} from "./types.js";
export { resolveAgentUISourceItemClosure } from "./closure.js";
export { isOptionalAgentUISourceItem } from "./optional-resource.js";
export { OfficialResourceError } from "./official-resource.js";
export type { OfficialAgentUIResource } from "./official-resource.js";
export { createOfficialResourceRegistry, officialResourceRegistry, resolveOfficialResource, validateOfficialResourceSources } from "./official-resource-registry.js";
export { MockUpdateSourceProvider, comparePluginVersions, parseReleaseDescriptor, resolveSourceRelease, verifySourceRelease, pluginSourceDigest } from "./release.js";
export type { UpdateSourceProvider, ReleaseDescriptor, ResolvedSourceRelease, ChangelogEntry } from "./release.js";
