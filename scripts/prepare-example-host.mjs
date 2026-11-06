import path from "node:path";
import { fileURLToPath } from "node:url";
import { access } from "node:fs/promises";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
export const exampleHosts = {
  platform: { directory: "creator-host-sandbox", port: 5180 },
  assistant: { directory: "creator-assistant-host", port: 5181 },
  embedded: { directory: "creator-embedded-host", port: 5182 },
};

function exampleHost(mode, root) {
  if (!Object.hasOwn(exampleHosts, mode)) throw new Error(`Unknown example Mode: ${mode}`);
  const projectRoot = path.join(root, "examples", exampleHosts[mode].directory);
  return { projectRoot, ...exampleHosts[mode] };
}

async function projectExists(projectRoot) {
  try { await access(path.join(projectRoot, ".agent-ui", "project.json")); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

/** Initialize missing examples without auditing existing application/source files. */
export async function ensureExampleHost(mode, { root = workspaceRoot, hasProject = projectExists, initializeProject } = {}) {
  const host = exampleHost(mode, root);
  if (await hasProject(host.projectRoot)) return host;
  if (!initializeProject) {
    const operator = await import("../packages/creator/dist/operator/dist/runtime/operator-runtime.mjs");
    const bootstrap = await import("../packages/creator/dist/operator/dist/bootstrap/index.js");
    initializeProject = input => bootstrap.initializeAgentUIProject(input, operator.createAgentUIInitializationHost());
  }
  await initializeProject({ projectRoot: host.projectRoot, mode, sourceRoot: "src/agent-ui" });
  return host;
}

/** Full example inspection is a manual check, separate from startup preparation. */
export async function checkExampleHost(mode, { root = workspaceRoot, inspectProject } = {}) {
  const host = exampleHost(mode, root);
  inspectProject ??= (await import("../packages/creator/dist/operator/dist/runtime/operator-runtime.mjs")).inspectCreatorProject;
  const state = await inspectProject(host.projectRoot);
  if (state.status !== "ready" || state.projectConfig.mode !== mode || state.projectConfig.sourceRoot !== "src/agent-ui") {
    throw new Error(`Example requires repair; existing files were preserved: ${JSON.stringify(state)}`);
  }
  return host;
}
