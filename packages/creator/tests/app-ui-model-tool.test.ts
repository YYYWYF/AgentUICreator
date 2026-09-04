import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CreatorActivityRecorder,
  PROJECT_CONTROL_ENTRY_PATH,
  ProjectControlAdapter,
} from "../src/index.js";
import { executeAppUIModelMutation } from "../src/project-control/appUIModelTool.js";

const temporaryProjects: string[] = [];

async function createMutationProject(changed: boolean): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "creator-app-ui-tool-"));
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
    path.join(projectRoot, "app-ui", "app-ui.json"),
    `${JSON.stringify({ version: "2", title: "Before" }, null, 2)}\n`,
  );
  await writeFile(
    path.join(projectRoot, "plugins", "registry.generated.ts"),
    "export const pluginDefinitions = [];\n",
  );
  await writeFile(
    path.join(projectRoot, PROJECT_CONTROL_ENTRY_PATH),
    `
const { readFile, writeFile } = await import("node:fs/promises");
let source = "";
for await (const chunk of process.stdin) source += chunk;
const request = JSON.parse(source);
const appUIPath = new URL("../app-ui/app-ui.json", import.meta.url);
if (${JSON.stringify(changed)}) {
  const model = JSON.parse(await readFile(appUIPath, "utf8"));
  model.title = "After";
  await writeFile(appUIPath, JSON.stringify(model, null, 2) + "\\n");
}
process.stdout.write(JSON.stringify({
  schemaVersion: 2,
  ok: true,
  result: {
    schemaVersion: 1,
    changed: ${JSON.stringify(changed)},
    changedPaths: ${JSON.stringify(changed ? ["app-ui/app-ui.json"] : [])},
    input: request.input
  }
}));
`,
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

describe("mutate_app_ui_model Creator tool", () => {
  it("captures before bytes and advances Activity only for target-reported writes", async () => {
    const projectRoot = await createMutationProject(true);
    const activity = new CreatorActivityRecorder(projectRoot);
    const adapter = new ProjectControlAdapter({ projectRoot });
    activity.begin();

    const output = await executeAppUIModelMutation(adapter, activity, {
      appUIModelHash: "a".repeat(64),
      operations: [
        {
          type: "update_instance_props",
          instanceId: "sample-main",
          set: { title: "After" },
        },
      ],
    });
    const receipt = await activity.finish();

    expect(output).toContain('"mutationRevision":1');
    expect(activity.revision).toBe(1);
    expect(receipt.files).toEqual([
      expect.objectContaining({
        path: "app-ui/app-ui.json",
        status: "modified",
      }),
    ]);
    expect(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    ).toContain('"title": "After"');
  });

  it("keeps the Activity revision unchanged for a semantic no-op", async () => {
    const projectRoot = await createMutationProject(false);
    const activity = new CreatorActivityRecorder(projectRoot);
    const adapter = new ProjectControlAdapter({ projectRoot });
    activity.begin();

    const output = await executeAppUIModelMutation(adapter, activity, {
      appUIModelHash: "a".repeat(64),
      operations: [
        {
          type: "set_instance_enabled",
          instanceId: "sample-main",
          enabled: true,
        },
      ],
    });

    expect(output).toContain('"mutationRevision":0');
    expect(activity.revision).toBe(0);
    expect((await activity.finish()).files).toEqual([]);
  });

  it("invalidates prompt state only for an AppUIModel hash conflict", async () => {
    const projectRoot = await createMutationProject(false);
    const activity = new CreatorActivityRecorder(projectRoot);
    activity.begin();
    const onStateInvalidated = vi.fn();
    const input = {
      appUIModelHash: "a".repeat(64),
      operations: [
        {
          type: "remove_instance",
          instanceId: "sample-main",
        },
      ],
    };
    const conflictAdapter = {
      async request() {
        throw Object.assign(new Error("AppUIModel changed externally."), {
          code: "APP_UI_MODEL_HASH_CONFLICT",
        });
      },
    };

    const conflict = await executeAppUIModelMutation(
      conflictAdapter,
      activity,
      input,
      { onStateInvalidated },
    );
    expect(conflict).toContain('"code":"APP_UI_MODEL_HASH_CONFLICT"');
    expect(onStateInvalidated).toHaveBeenCalledOnce();
    expect(onStateInvalidated).toHaveBeenCalledWith("hash_conflict");
    expect(activity.revision).toBe(0);

    onStateInvalidated.mockClear();
    const ordinaryFailureAdapter = {
      async request() {
        throw Object.assign(new Error("Invalid operation."), {
          code: "APP_UI_MODEL_OPERATION_INVALID",
        });
      },
    };
    await executeAppUIModelMutation(
      ordinaryFailureAdapter,
      activity,
      input,
      { onStateInvalidated },
    );
    expect(onStateInvalidated).not.toHaveBeenCalled();
  });
});
