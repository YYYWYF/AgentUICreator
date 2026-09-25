import path from "node:path";
import { fileURLToPath } from "node:url";

import { inspectCreatorProject } from "../../agent-frontend/scripts/ui-project/creator-project-inspector";
import { initializeAgentUIProject } from "../../agent-frontend/scripts/ui-project/initialize-agent-ui-project";

const examplesRoot = fileURLToPath(new URL("../..", import.meta.url));
const sourceRoot = "src/agent-ui";
const command = process.argv[2];
const mode = command === "inspect" ? undefined : process.argv[3];
const projectName = command === "inspect" ? process.argv[3] : process.argv[4];
const allowedProjects = new Set([
  "creator-host-sandbox",
  "creator-assistant-host",
  "creator-embedded-host",
]);
if (projectName !== undefined && !allowedProjects.has(projectName)) {
  throw new Error(`Unknown Host project: ${projectName}`);
}
const projectRoot = path.join(examplesRoot, projectName ?? "creator-host-sandbox");

function describeState(state: Awaited<ReturnType<typeof inspectCreatorProject>>) {
  if (state.status === "ready") {
    return {
      status: state.status,
      mode: state.projectConfig.mode,
      sourceRoot: state.projectConfig.version === "2" ? state.projectConfig.sourceRoot : undefined,
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
    throw new Error("Usage: host-project.ts inspect [project] | init|ensure assistant|embedded|platform [project]");
  }
  const before = await inspectCreatorProject(projectRoot);
  if (command === "ensure" && before.status === "ready") {
    if (before.projectConfig.mode !== mode || before.projectConfig.version !== "2" || before.projectConfig.sourceRoot !== sourceRoot) {
      throw new Error(`Project is already initialized with a different configuration: ${JSON.stringify(describeState(before))}`);
    }
    return;
  }
  if (before.status !== "uninitialized") {
    throw new Error(`Project status is ${before.status}. Run this Host project's reset script before initializing again.`);
  }

  await initializeAgentUIProject({ projectRoot, mode, sourceRoot });
  const after = await inspectCreatorProject(projectRoot);
  if (after.status !== "ready" || after.projectConfig.version !== "2" ||
      after.projectConfig.mode !== mode || after.projectConfig.sourceRoot !== sourceRoot) {
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
