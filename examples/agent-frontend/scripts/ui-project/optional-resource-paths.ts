import path from "node:path";
import { resolveAgentUIProjectPaths, projectControlConfigForPaths } from "./agent-ui-project-paths";
import { readAgentUIProjectConfig } from "./project-mode";

export async function resourcePaths(projectRoot: string) {
  const project = await readAgentUIProjectConfig(projectRoot);
  const paths = resolveAgentUIProjectPaths(projectRoot, project.config);
  const config = projectControlConfigForPaths(paths);
  if (project.config.version !== "2") {
    // Keep the legacy adapter registry/lock intact. Demo files follow the actual
    // application managed root, using the same source transaction implementation.
    config.agentUI = { ...config.agentUI, sourceRoot: ".", metadataRoot: path.relative(projectRoot, path.join(paths.metadataRoot, "scenario-resources")), providedSourceItems: ["foundation/core-runtime"] };
  }
  return { paths, config };
}

