import {
  mkdtemp,
  mkdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_PROJECT_SNAPSHOT_ASSETS,
  MAX_PROJECT_SNAPSHOT_PROMPT_CHARACTERS,
  PROJECT_CONTROL_ENTRY_PATH,
  CreatorActivityRecorder,
  ProjectControlAdapter,
  createCreatorAgent,
  createProjectSnapshot,
  createCreatorProjectTools,
  formatProjectSnapshotForPrompt,
  loadProjectSnapshot,
  type CreatorProjectControlMetadata,
  type UIProjectInspection,
} from "../src/index.js";

const temporaryProjects: string[] = [];

function inspectionFixture(): UIProjectInspection {
  return {
    schemaVersion: 2,
    appUIModel: {
      hash: "a".repeat(64),
      version: "2",
      layout: {
        id: "right-panel",
        type: "panel",
        width: "360px",
        child: {
          id: "history-slot-node",
          type: "slot",
          slotId: "history",
        },
      },
      slots: [
        {
          slotId: "history",
          nodeId: "history-slot-node",
          nodePath: "root.child",
          mounts: [
            {
              instanceId: "history-main",
              pluginId: "conversation-history",
              enabled: true,
            },
          ],
        },
      ],
    },
    pluginInstances: [
      {
        id: "history-main",
        pluginId: "conversation-history",
        enabled: true,
        mount: { slotId: "history" },
        mountedSlotId: "history",
        props: { activeKey: "current", privateLargeValue: "x".repeat(20_000) },
      },
    ],
    registry: {
      selectedPluginIds: ["conversation-history"],
      registeredPluginIds: ["conversation-history"],
      generatedFileFresh: true,
      issues: [],
    },
    pluginAssets: [
      {
        pluginId: "conversation-history",
        directory: "conversation-history",
        manifestPath: "plugins/conversation-history/manifest.json",
        definitionPath: "plugins/conversation-history/definition.ts",
        capabilities: ["visual"],
        selected: true,
      },
    ],
    catalogs: [{ path: "plugins/catalog", exists: true }],
    uiStack: [{ packageName: "react", version: "19.2.8" }],
  };
}

function metadataFixture(): CreatorProjectControlMetadata {
  return {
    runId: "run-3",
    mutationRevision: 2,
    validations: [
      {
        command: "pnpm verify:ui",
        status: "passed",
        runId: "run-3",
        revision: 1,
        current: false,
      },
    ],
    verification: {
      status: "changed-and-verified",
      runId: "run-2",
      revision: 1,
      current: false,
    },
    runtimeDiagnostics: { available: false },
  };
}

async function createControlProject(
  inspection: UIProjectInspection,
): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "creator-tools-"));
  temporaryProjects.push(projectRoot);
  const executableDirectory = path.join(projectRoot, "node_modules", ".bin");
  await mkdir(path.join(projectRoot, "scripts"), { recursive: true });
  await mkdir(path.join(projectRoot, "app-ui"));
  await mkdir(path.join(projectRoot, "plugins"));
  await mkdir(executableDirectory, { recursive: true });
  await symlink(
    process.execPath,
    path.join(
      executableDirectory,
      process.platform === "win32" ? "tsx.cmd" : "tsx",
    ),
  );
  await writeFile(
    path.join(projectRoot, PROJECT_CONTROL_ENTRY_PATH),
    `
let source = "";
for await (const chunk of process.stdin) source += chunk;
const request = JSON.parse(source);
const inspection = ${JSON.stringify(inspection)};
const result = request.operation === "inspect_ui_project"
  ? inspection
  : { operation: request.operation, input: request.input };
process.stdout.write(JSON.stringify({ schemaVersion: 2, ok: true, result }));
`,
  );
  await writeFile(
    path.join(projectRoot, "app-ui", "app-ui.json"),
    JSON.stringify({ version: "2" }),
  );
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

describe("Creator project snapshot and tools", () => {
  it("keeps permanent source deletion out of real Creator tools until confirmation is wired", async () => {
    const projectRoot = await createControlProject(inspectionFixture());
    const activity = new CreatorActivityRecorder(projectRoot);
    activity.begin("tool-catalog-run");
    const tools = createCreatorProjectTools(
      new ProjectControlAdapter({ projectRoot }),
      activity,
    );

    expect(tools.map((candidate) => candidate.name)).toContain(
      "undo_creator_run",
    );
    expect(tools.map((candidate) => candidate.name)).not.toContain(
      "delete_ui_plugin_source",
    );
  });

  it("injects a bounded navigation snapshot and executes inspect_ui_project", async () => {
    const projectRoot = await createControlProject(inspectionFixture());
    const activity = new CreatorActivityRecorder(projectRoot);
    const model = fakeModel()
      .respondWithTools([{ name: "inspect_ui_project", args: {} }])
      .respond(new AIMessage("Project inspected."));
    const agent = createCreatorAgent({
      model,
      projectRoot,
      activity,
      completionGate: false,
    });

    activity.begin();
    const result = await agent.invoke({
      messages: [{ role: "user", content: "检查右侧的历史会话组件。" }],
    });

    const firstCall = model.calls[0]?.messages
      .map((message) => message.text)
      .join("\n");
    const toolResult = result.messages.find(
      (message: unknown) =>
        ToolMessage.isInstance(message) && message.name === "inspect_ui_project",
    ) as ToolMessage | undefined;
    expect(firstCall).toContain("<ui-project-navigation-snapshot>");
    expect(firstCall).toContain("<creator-current-state>");
    expect(firstCall).toContain("right-panel");
    expect(firstCall).toContain("conversation-history");
    expect(firstCall).not.toContain("privateLargeValue\":\"xxxx");
    expect(toolResult?.text).toContain('"generatedFileFresh":true');
  });

  it("keeps huge props and asset catalogs below the prompt hard limit", () => {
    const inspection = inspectionFixture();
    inspection.pluginAssets = Array.from(
      { length: MAX_PROJECT_SNAPSHOT_ASSETS + 50 },
      (_, index) => ({
        pluginId: `plugin-${index}-${"x".repeat(300)}`,
        directory: `plugin-${index}`,
        manifestPath: `plugins/plugin-${index}/manifest.json`,
        definitionPath: `plugins/plugin-${index}/definition.ts`,
        capabilities: ["visual"],
        selected: index === 0,
      }),
    );

    const snapshot = createProjectSnapshot(inspection, metadataFixture());
    const prompt = formatProjectSnapshotForPrompt(snapshot);

    expect(prompt.length).toBeLessThanOrEqual(
      MAX_PROJECT_SNAPSHOT_PROMPT_CHARACTERS,
    );
    expect(snapshot.truncated).toBe(true);
    expect(prompt).not.toContain("privateLargeValue\":\"xxxx");
    expect(prompt).not.toContain('"creator"');
  });

  it("marks validation evidence stale after the project revision changes", async () => {
    const projectRoot = await createControlProject(inspectionFixture());
    const activity = new CreatorActivityRecorder(projectRoot);
    activity.begin();
    activity.recordValidation("pnpm verify:ui", {
      output: "passed",
      exitCode: 0,
      truncated: false,
    });
    activity.touch("/project/app-ui/app-ui.json");

    const metadata = activity.projectControlMetadata();

    expect(metadata.mutationRevision).toBe(1);
    expect(metadata.validations).toEqual([
      expect.objectContaining({
        command: "pnpm verify:ui",
        revision: 0,
        current: false,
      }),
    ]);
  });

  it("surfaces a missing target control entry instead of reconstructing the project", async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), "creator-tools-"));
    temporaryProjects.push(projectRoot);
    const adapter = new ProjectControlAdapter({ projectRoot });
    const snapshot = await loadProjectSnapshot(adapter);

    expect(snapshot).toMatchObject({
      status: "unavailable",
      error: { code: "CONTROL_ENTRY_MISSING" },
    });
  });
});
