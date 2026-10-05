import { createAgentUIInitializationHost } from "../../packages/project-control/dist/runtime/project-control-runtime.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { handleUIProjectControlRequest, inspectCreatorProject } from "../../packages/project-control/dist/runtime/project-control-runtime.mjs";
import { initializeAgentUIProject } from "../../packages/bootstrap/dist/index.js";
import { ensureManagedHostPlugins } from "./ensure-managed-plugins.js";
import { ensureManagedConversationBinding } from "./ensure-managed-conversation-binding.js";

const initializationHost = createAgentUIInitializationHost();

const examplesRoot = fileURLToPath(new URL("../../examples/", import.meta.url));
const sourceRoot = "src/agent-ui";
const command = process.argv[2];
const mode = command === "inspect" ? undefined : process.argv[3];
const projectName = command === "inspect" ? process.argv[3] : process.argv[4];
const allowedProjects = new Set([
  "creator-host-sandbox",
  "creator-assistant-host",
  "creator-embedded-host",
]);
if (projectName === undefined || !allowedProjects.has(projectName)) {
  throw new Error(`Unknown Host project: ${projectName}`);
}
const projectRoot = path.join(examplesRoot, projectName);

function describeState(state: Awaited<ReturnType<typeof inspectCreatorProject>>) {
  if (state.status === "ready") {
    return {
      status: state.status,
      mode: state.projectConfig.mode,
      sourceRoot: state.projectConfig.sourceRoot,
    };
  }
  return { status: state.status, ...(state.status === "broken" ? { issues: state.issues } : {}) };
}

async function main() {
  if (command === "inspect") {
    console.log(JSON.stringify(describeState(await inspectCreatorProject(projectRoot)), null, 2));
    return;
  }

  if ((command !== "init" && command !== "ensure") || (mode !== "assistant" && mode !== "embedded" && mode !== "platform")) {
    throw new Error("Usage: host-project.ts inspect project | init|ensure assistant|embedded|platform project");
  }
  const before = await inspectCreatorProject(projectRoot);
  if (command === "ensure" && before.status === "ready") {
    if (before.projectConfig.mode !== mode || before.projectConfig.sourceRoot !== sourceRoot) {
      throw new Error(`Project is already initialized with a different configuration: ${JSON.stringify(describeState(before))}`);
    }
    const sources = await handleUIProjectControlRequest({ operation: "inspect_agent_ui_sources", input: {} }, projectRoot);
    if (!sources.ok) throw new Error("Could not inspect managed Host sources");
    const inspection = sources.result as import("../../packages/project-control/src/dev").AgentUISourceInspection;
    const core = inspection.items.find(item => item.id === "foundation/core");
    if (core && (core.updateAvailable || core.dependencies.some(id => inspection.items.some(item => item.id === id && item.updateAvailable)))) {
      if (core.status === "customized" || core.status === "blocked") {
        console.warn("Preserving the Host's customized foundation; automatic source upgrades are skipped.");
      } else {
        const upgraded = await handleUIProjectControlRequest({ operation: "apply_agent_ui_source_item", input: {
          itemId: "foundation/core", expectedStateHash: inspection.stateHash,
        } }, projectRoot);
        if (!upgraded.ok) {
          if (upgraded.error.code === "AGENT_UI_SOURCE_CUSTOMIZED_DEPENDENCY") console.warn(`Preserving the Host foundation: ${upgraded.error.message}`);
          else throw new Error(`Could not upgrade the managed Host foundation: ${upgraded.error.code}: ${upgraded.error.message}`);
        }
      }
    }
    await ensureManagedHostPlugins(request => handleUIProjectControlRequest({ ...request }, projectRoot), { preserveCustomized: true });
    if (projectName === "creator-host-sandbox") await ensureManagedConversationBinding(projectRoot);
    return;
  }
  if (before.status !== "uninitialized") {
    throw new Error(`Project status is ${before.status}. Run this Host project's reset script before initializing again.`);
  }

  await initializeAgentUIProject({ projectRoot, mode, sourceRoot }, initializationHost);
  const after = await inspectCreatorProject(projectRoot);
  if (after.status !== "ready" || after.projectConfig.mode !== mode ||
      after.projectConfig.sourceRoot !== sourceRoot) {
    throw new Error(`Initialization postcondition failed: ${JSON.stringify(describeState(after))}`);
  }
  console.log([
    "Initialized Agent UI",
    `Mode: ${mode}`,
    `sourceRoot: ${sourceRoot}`,
    `Public entry: ${path.posix.join(sourceRoot, "index.ts")}`,
    `Project status: ${after.status}`,
  ].join("\n"));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
