import type { ResourceSourceInspection } from "../resources.mjs";
import { resolveAgentUIProjectPaths, projectControlConfigForPaths } from "./agent-ui-project-paths";
import { readAgentUIProjectConfig } from "./project-mode";

export async function resourcePaths(projectRoot: string) {
  const project = await readAgentUIProjectConfig(projectRoot);
  const paths = resolveAgentUIProjectPaths(projectRoot, project.config);
  const config = projectControlConfigForPaths(paths);
  return { paths, config };
}

/** Use the same ownership projection for the Workbench and its regression tests. */
export async function mergeOptionalResourceInspection<T extends ResourceSourceInspection>(normal: T, resources: ResourceSourceInspection): Promise<T> {
  // installedVersion identifies resource-lock ownership or a provided Host item.
  // Dependency ownership is independent of the allowlist for installation roots
  // and remains authoritative even when owned source is customized or incomplete.
  const resourceOwnedIds = new Set(resources.items
    .filter(item => item.installedVersion !== undefined)
    .map(item => item.id));
  return { ...normal, ...(resources.integrationRegistryReady === undefined ? {} : { integrationRegistryReady: resources.integrationRegistryReady }), items: [
    ...normal.items.filter(item => !resourceOwnedIds.has(item.id)),
    ...resources.items.filter(item => resourceOwnedIds.has(item.id)),
  ] };
}
