import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
export const exampleHosts = {
  platform: { directory: "creator-host-sandbox", port: 5180 },
  assistant: { directory: "creator-assistant-host", port: 5181 },
  embedded: { directory: "creator-embedded-host", port: 5182 },
};

/** Initialize only missing examples; ready projects retain all application/source edits. */
export async function ensureExampleHost(mode, { root = workspaceRoot, inspectProject, initializeProject } = {}) {
  if (!Object.hasOwn(exampleHosts, mode)) throw new Error(`Unknown example Mode: ${mode}`);
  const projectRoot = path.join(root, "examples", exampleHosts[mode].directory);
  if (!inspectProject || !initializeProject) {
    const operator = await import("../packages/operator/dist/operator/dist/runtime/operator-runtime.mjs");
    const bootstrap = await import("../packages/operator/dist/operator/dist/bootstrap/index.js");
    inspectProject = operator.inspectCreatorProject;
    initializeProject = input => bootstrap.initializeAgentUIProject(input, operator.createAgentUIInitializationHost());
  }
  const validate = state => state.status === "ready" && state.projectConfig.mode === mode && state.projectConfig.sourceRoot === "src/agent-ui";
  let state = await inspectProject(projectRoot);
  if (state.status === "uninitialized") {
    await initializeProject({ projectRoot, mode, sourceRoot: "src/agent-ui" });
    state = await inspectProject(projectRoot);
  }
  if (!validate(state)) throw new Error(`Example requires repair; existing files were preserved: ${JSON.stringify(state)}`);
  return { projectRoot, ...exampleHosts[mode] };
}
