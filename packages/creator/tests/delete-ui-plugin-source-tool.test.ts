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

import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_CREATOR_TRANSACTION_BYTES,
  CreatorActivityRecorder,
  CreatorCommandRunner,
  PROJECT_CONTROL_ENTRY_PATH,
  ProjectControlAdapter,
  executeDeleteUIPluginSource,
  type CreatorPluginSourceDeleteAuthorization,
} from "../src/index.js";

const temporaryProjects: string[] = [];

interface ProjectOptions {
  directory?: string;
  instances?: Array<{ id: string; pluginId: string }>;
  references?: Array<{
    path: string;
    line: number;
    column: number;
    kind: "module" | "plugin-id-literal" | "plugin-id-manifest";
    value: string;
  }>;
  registryFresh?: boolean;
  definitionSource?: string;
}

async function createProject({
  directory = "sample",
  instances = [],
  references = [],
  registryFresh = true,
  definitionSource = "export default {};\n",
}: ProjectOptions = {}): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "delete-ui-plugin-"));
  temporaryProjects.push(projectRoot);
  const executableDirectory = path.join(projectRoot, "node_modules", ".bin");
  await mkdir(path.join(projectRoot, "scripts"));
  await mkdir(path.join(projectRoot, "plugins", "sample", "nested"), {
    recursive: true,
  });
  await mkdir(executableDirectory, { recursive: true });
  await symlink(
    process.execPath,
    path.join(
      executableDirectory,
      process.platform === "win32" ? "tsx.cmd" : "tsx",
    ),
  );
  await writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({
      scripts: {
        "verify:ui": "node -e \"console.log('ui ok')\"",
        typecheck: "node -e \"console.log('types ok')\"",
      },
    }),
  );
  await writeFile(
    path.join(projectRoot, "plugins", "sample", "manifest.json"),
    JSON.stringify({ id: "sample" }),
  );
  await writeFile(
    path.join(projectRoot, "plugins", "sample", "definition.ts"),
    definitionSource,
  );
  await writeFile(
    path.join(projectRoot, "plugins", "sample", "nested", "styles.css"),
    ".sample { color: red; }\n",
  );
  const inspection = {
    schemaVersion: 2,
    appUIModel: {
      hash: "a".repeat(64),
      version: "2",
      layout: { type: "slot", id: "main", slotId: "main" },
      slots: [],
    },
    pluginInstances: instances.map((instance) => ({
      ...instance,
      enabled: false,
    })),
    registry: {
      selectedPluginIds: instances.length === 0 ? [] : ["sample"],
      registeredPluginIds: instances.length === 0 ? [] : ["sample"],
      generatedFileFresh: registryFresh,
      issues: [],
    },
    pluginAssets: [
      {
        pluginId: "sample",
        directory,
        manifestPath: `plugins/${directory}/manifest.json`,
        definitionPath: `plugins/${directory}/definition.ts`,
        capabilities: ["visual"],
        selected: instances.length > 0,
      },
    ],
    catalogs: [],
    uiStack: [],
  };
  const referenceInspection = {
    pluginId: "sample",
    directory,
    references,
    truncated: false,
  };
  await writeFile(
    path.join(projectRoot, PROJECT_CONTROL_ENTRY_PATH),
    `
let source = "";
for await (const chunk of process.stdin) source += chunk;
const request = JSON.parse(source);
const result = request.operation === "inspect_ui_project"
  ? ${JSON.stringify(inspection)}
  : request.operation === "inspect_ui_plugin_source_references"
    ? ${JSON.stringify(referenceInspection)}
    : (() => { throw new Error("unexpected operation " + request.operation); })();
process.stdout.write(JSON.stringify({ schemaVersion: 2, ok: true, result }));
`,
  );
  return projectRoot;
}

function authorization(
  runId = "delete-run",
  pluginId = "sample",
): CreatorPluginSourceDeleteAuthorization {
  return { runId, pluginId, source: "explicit-user-request" };
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

async function execute(
  projectRoot: string,
  providedAuthorization?: CreatorPluginSourceDeleteAuthorization,
) {
  const activity = new CreatorActivityRecorder(projectRoot);
  activity.begin("delete-run");
  const output = JSON.parse(
    await executeDeleteUIPluginSource(
      new ProjectControlAdapter({ projectRoot }),
      activity,
      new CreatorCommandRunner({ projectRoot, activity }),
      { pluginId: "sample" },
      providedAuthorization,
    ),
  ) as {
    ok: boolean;
    error?: { code: string; details?: unknown };
    result?: unknown;
  };
  return { activity, output };
}

describe("delete_ui_plugin_source", () => {
  it("rejects missing or mismatched trusted authorization", async () => {
    const projectRoot = await createProject();

    const missing = await execute(projectRoot);
    const wrongRun = await execute(projectRoot, authorization("other-run"));

    expect(missing.output.error?.code).toBe(
      "CREATOR_PLUGIN_DELETE_UNAUTHORIZED",
    );
    expect(wrongRun.output.error?.code).toBe(
      "CREATOR_PLUGIN_DELETE_UNAUTHORIZED",
    );
    expect(missing.activity.revision).toBe(0);
    await expect(
      readFile(path.join(projectRoot, "plugins", "sample", "definition.ts"), "utf8"),
    ).resolves.toContain("export default");
  });

  it("rejects AppUIModel, Registry, and source references before deletion", async () => {
    const modelProject = await createProject({
      instances: [{ id: "sample-main", pluginId: "sample" }],
    });
    const registryProject = await createProject({ registryFresh: false });
    const sourceProject = await createProject({
      references: [
        {
          path: "plugins/consumer/index.ts",
          line: 1,
          column: 20,
          kind: "module",
          value: "../sample",
        },
      ],
    });

    expect((await execute(modelProject, authorization())).output.error?.code).toBe(
      "CREATOR_PLUGIN_DELETE_MODEL_REFERENCE",
    );
    expect(
      (await execute(registryProject, authorization())).output.error?.code,
    ).toBe("CREATOR_PLUGIN_DELETE_REGISTRY_UNSAFE");
    expect(
      (await execute(sourceProject, authorization())).output.error?.code,
    ).toBe("CREATOR_PLUGIN_DELETE_SOURCE_REFERENCE");
  });

  it("rejects a target-owned asset path that is not exactly plugins/<one-directory>", async () => {
    const projectRoot = await createProject({ directory: "../outside" });

    const { output } = await execute(projectRoot, authorization());

    expect(output.error?.code).toBe("CREATOR_PLUGIN_DELETE_PATH_INVALID");
    await expect(
      readFile(path.join(projectRoot, "plugins", "sample", "manifest.json"), "utf8"),
    ).resolves.toContain("sample");
  });

  it("rejects journal overflow before removing any file", async () => {
    const projectRoot = await createProject({
      definitionSource: "x".repeat(MAX_CREATOR_TRANSACTION_BYTES),
    });

    const { activity, output } = await execute(projectRoot, authorization());

    expect(output.error?.code).toBe("CREATOR_TRANSACTION_TOO_LARGE");
    expect(activity.revision).toBe(0);
    await expect(
      readFile(path.join(projectRoot, "plugins", "sample", "definition.ts"), "utf8"),
    ).resolves.toHaveLength(MAX_CREATOR_TRANSACTION_BYTES);
  });

  it("deletes only the exact unreferenced source directory and remains fully undoable", async () => {
    const projectRoot = await createProject();

    const { activity, output } = await execute(projectRoot, authorization());
    const receipt = await activity.finish();

    expect(output).toMatchObject({ ok: true });
    await expect(
      readFile(path.join(projectRoot, "plugins", "sample", "manifest.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(receipt.files).toHaveLength(3);
    expect(receipt.files.every((file) => file.status === "deleted")).toBe(true);
    expect(receipt.transaction).toEqual({
      runId: "delete-run",
      undoable: true,
    });
    expect(receipt.validations).toEqual([
      expect.objectContaining({ command: "pnpm verify:ui", status: "passed" }),
      expect.objectContaining({ command: "pnpm typecheck", status: "passed" }),
    ]);

    await activity.transactions.undo("delete-run");
    await expect(
      readFile(path.join(projectRoot, "plugins", "sample", "manifest.json"), "utf8"),
    ).resolves.toContain("sample");
    await expect(
      readFile(
        path.join(projectRoot, "plugins", "sample", "nested", "styles.css"),
        "utf8",
      ),
    ).resolves.toContain("color: red");
  });
});
