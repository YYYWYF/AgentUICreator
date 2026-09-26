import path from "node:path";
import { access } from "node:fs/promises";
import { loadAgentUISourceRegistry, isOptionalAgentUISourceItem } from "@agent-ui/source-registry";
import type { AgentUISourceInspection } from "./types";
import { resolveAgentUIProjectPaths, projectControlConfigForPaths } from "./agent-ui-project-paths";
import { readAgentUIProjectConfig } from "./project-mode";

export async function resourcePaths(projectRoot: string) {
  const project = await readAgentUIProjectConfig(projectRoot);
  const paths = resolveAgentUIProjectPaths(projectRoot, project.config);
  const config = projectControlConfigForPaths(paths);
  if (project.config.version !== "2") {
    // Keep the legacy adapter registry/lock intact. Demo files follow the actual
    // application managed root, using the same source transaction implementation.
    const registry = await loadAgentUISourceRegistry();
    const providedSourceFilePaths: Record<string, string> = {};
    for (const [target, hostPath] of Object.entries({
      "index.ts": "src/App.tsx",
      "application/Agent.tsx": "src/App.tsx",
      "application/composition-store.ts": "src/runtime-composition-store.ts",
    })) {
      const exists = async (relative: string) => access(path.join(projectRoot, relative)).then(() => true, error => {
        if (error.code === "ENOENT") return false; throw error;
      });
      if (!await exists(target) && await exists(hostPath)) providedSourceFilePaths[target] = hostPath;
    }
    config.agentUI = {
      ...config.agentUI,
      sourceRoot: ".",
      providedSourceFilePaths,
      metadataRoot: path.relative(projectRoot, path.join(paths.metadataRoot, "scenario-resources")),
      providedSourceItems: registry.items.filter(item => item.kind === "foundation").map(item => item.id),
    };
  }
  return { paths, config };
}

/** Use the same ownership projection for the Workbench and its regression tests. */
export async function mergeOptionalResourceInspection<T extends { items: readonly { id: string; status: string }[] }>(normal: T, resources: AgentUISourceInspection): Promise<T> {
  const registry = await loadAgentUISourceRegistry();
  const optionalIds = new Set(registry.items.filter(isOptionalAgentUISourceItem).map(item => item.id));
  // Legacy foundation facts also come from the host-owned file inspection, rather
  // than the normal managed source root. They are prerequisites, not installed resources.
  const providedIds = resources.sourceRoot === "." ? new Set(registry.items.filter(item => item.kind === "foundation").map(item => item.id)) : new Set<string>();
  const usesResourceInspection = (id: string) => optionalIds.has(id) || providedIds.has(id);
  return { ...normal, items: [
    ...normal.items.filter(item => !usesResourceInspection(item.id)),
    ...resources.items.filter(item => usesResourceInspection(item.id)),
  ] };
}
