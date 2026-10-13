import { officialPackagePlugin, type LoadedAgentUISourceItem } from "@agent-ui/source-registry";

export function packageSourceDependency(id: string) {
  return id.startsWith("plugin/") ? officialPackagePlugin(id.slice(7)) : undefined;
}

export function withPackageDependency(item: LoadedAgentUISourceItem): LoadedAgentUISourceItem {
  const official = packageSourceDependency(item.id);
  return official ? { ...item, packages: { ...item.packages, [official.runtime.package]: official.runtime.version } } : item;
}
