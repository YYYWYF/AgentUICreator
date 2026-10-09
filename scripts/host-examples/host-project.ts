import { createAgentUIInitializationHost } from "../../packages/project-control/dist/runtime/project-control-runtime.mjs";
import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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

  if ((command !== "init" && command !== "ensure" && command !== "adopt-sidebar") || (mode !== "assistant" && mode !== "embedded" && mode !== "platform")) {
    throw new Error("Usage: host-project.ts inspect project | init|ensure|adopt-sidebar assistant|embedded|platform project");
  }
  if (command === "adopt-sidebar") {
    const state = await inspectCreatorProject(projectRoot);
    if (state.status !== "ready" || state.projectConfig.mode !== mode || state.projectConfig.sourceRoot !== sourceRoot || mode === "embedded") {
      throw new Error("Sidebar adoption requires a ready platform or assistant Host with src/agent-ui.");
    }
    const source = await readFile(path.join(projectRoot, sourceRoot, "app-ui/app-ui.json"), "utf8");
    const model = JSON.parse(source);
    const root = model.root;
    if (root.type === "sidebar" && root.header) return;
    const history = root.children?.[0];
    if (root.type !== "sidebar" && (root.type !== "row" || history?.type !== "panel" || history.child?.type !== "slot" ||
        history.child.plugins?.length !== 1 || history.child.plugins[0].pluginId !== "conversation-thread-list" || root.children.length < 2)) {
      throw new Error("Sidebar adoption requires the legacy default history-first Row; customized layouts must be migrated explicitly.");
    }
    const sources = await handleUIProjectControlRequest({ operation: "inspect_agent_ui_sources", input: {} }, projectRoot);
    if (!sources.ok) throw new Error("Could not inspect managed Host sources");
    const installed = await handleUIProjectControlRequest({ operation: "apply_agent_ui_source_item", input: {
      itemId: "plugin/agent-identity", expectedStateHash: (sources.result as { stateHash: string }).stateHash,
    } }, projectRoot);
    if (!installed.ok) throw new Error(`Could not install Agent identity: ${JSON.stringify(installed.error)}`);
    const content = root.type === "sidebar" ? root.content : { ...root, children: root.children.slice(1) };
    if (root.type !== "sidebar" && content.sizes) content.sizes = content.sizes.slice(1);
    if (root.type !== "sidebar" && content.responsive) {
      if (content.responsive.primaryIndex < 1 || content.responsive.drawerIndex < 1) throw new Error("Unsupported responsive history placement.");
      content.responsive = { ...content.responsive, primaryIndex: content.responsive.primaryIndex - 1, drawerIndex: content.responsive.drawerIndex - 1 };
    }
    const result = await handleUIProjectControlRequest({ operation: "mutate_app_ui_model", input: {
      appUIModelHash: createHash("sha256").update(source).digest("hex"),
      operations: [{ type: "replace_layout_node", nodeRef: "l0", node: {
        ...(root.type === "sidebar" ? root : {
          type: "sidebar", defaultActive: mode === "platform" ? "history" : null,
          items: [{ id: "history", child: history.child }], content,
        }),
        header: { type: "slot", plugins: [{ id: "agent-identity-main", pluginId: "agent-identity", enabled: true }] },
      } }],
    } }, projectRoot);
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    console.log("Adopted the default Sidebar with Agent identity Header, preserving existing plugin configuration.");
    return;
  }
  if (command === "ensure" && await access(path.join(projectRoot, ".agent-ui/project.json")).then(() => true, () => false)) {
    const migration = await handleUIProjectControlRequest({ operation: "migrate_official_package_plugin", input: { pluginId: "assistant-ui-composer" } }, projectRoot);
    if (!migration.ok) throw new Error(`${migration.error.code}: ${migration.error.message}`);
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
