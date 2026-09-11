import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AppUIModel } from "../framework/contracts/app-ui-model";
import {
  handleUIProjectControlRequest,
  MAX_PLUGIN_SOURCE_CHARACTERS,
} from "../scripts/ui-project-control";
import {
  GENERATED_PLUGIN_REGISTRY_PATH,
  generatePluginRegistry,
  PLUGIN_REGISTRY_ENTRY_PATH,
  PLUGIN_REGISTRY_ENTRY_SOURCE,
} from "../scripts/ui-project/registry-generator";
import type { UIProjectControlConfig } from "../scripts/ui-project/types";

const temporaryProjects: string[] = [];
const fixtureConfig: UIProjectControlConfig = {
  catalogs: [],
  uiPackages: ["react"],
  agentUI: { sourceRoot: "agent-ui", metadataRoot: ".agent-ui" },
};

async function createProject(
  definitionSource =
    "const Component = () => null;\nexport default { manifest: {}, Component };\n",
) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "ui-control-"));
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "app-ui"));
  await mkdir(path.join(projectRoot, "plugins", "sample"), {
    recursive: true,
  });
  await writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ dependencies: { react: "19.2.8" } }),
  );
  await writeFile(
    path.join(projectRoot, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Bundler",
        target: "ES2022",
      },
      include: ["plugins/**/*.ts"],
    }),
  );
  await writeFile(
    path.join(projectRoot, "plugins", "sample", "manifest.json"),
    JSON.stringify({
      id: "sample",
      name: "Sample",
      description: "Fixture",
      version: "1.0.0",
      capabilities: ["visual"],
    }),
  );
  await writeFile(
    path.join(projectRoot, "plugins", "sample", "definition.ts"),
    definitionSource,
  );
  const model: AppUIModel = {
    version: "2",
    root: {
      type: "slot",
      id: "main-node",
      slotId: "main",
    },
    pluginInstances: {
      "sample-main": {
        id: "sample-main",
        pluginId: "sample",
        enabled: true,
        mount: { slotId: "main" },
        props: { title: "Sample title" },
      },
    },
  };
  const appUIModelSource = JSON.stringify(model, null, 2);
  await writeFile(
    path.join(projectRoot, "app-ui", "app-ui.json"),
    appUIModelSource,
  );
  const registry = await generatePluginRegistry(
    projectRoot,
    model,
    fixtureConfig,
  );
  await writeFile(
    path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH),
    registry.source,
  );
  await writeFile(
    path.join(projectRoot, PLUGIN_REGISTRY_ENTRY_PATH),
    PLUGIN_REGISTRY_ENTRY_SOURCE,
  );
  return { projectRoot, appUIModelSource };
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

describe("ui-project-control", () => {
  it("returns the target-owned project inspection through the versioned protocol", async () => {
    const { projectRoot } = await createProject();

    const response = await handleUIProjectControlRequest(
      { schemaVersion: 3, operation: "inspect_ui_project", input: {} },
      projectRoot,
    );

    expect(response.ok).toBe(true);
    expect(response).toMatchObject({
      schemaVersion: 3,
      result: {
        appUIModel: {
          slots: [expect.objectContaining({ nodePath: "root" })],
        },
        registry: { generatedFileFresh: true },
      },
    });
  });

  it("returns the exact AppUIModel source and hash", async () => {
    const { projectRoot, appUIModelSource } = await createProject();

    const response = await handleUIProjectControlRequest(
      { schemaVersion: 3, operation: "inspect_app_ui_model", input: {} },
      projectRoot,
    );

    expect(response.ok).toBe(true);
    expect(response).toMatchObject({
      result: {
        source: appUIModelSource,
        hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
    });
  });

  it("returns reachable Slot owners and configured mounts", async () => {
    const { projectRoot } = await createProject();

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "inspect_ui_slots",
        input: { root: "main" },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        slots: [
          expect.objectContaining({
            slotId: "main",
            owner: {
              kind: "layout",
              nodeId: "main-node",
              nodePath: "root",
            },
            nodeId: "main-node",
            mounts: [
              expect.objectContaining({
                instanceId: "sample-main",
                pluginId: "sample",
                enabled: true,
              }),
            ],
          }),
        ],
        selected: expect.objectContaining({
          slotId: "main",
          nodeId: "main-node",
        }),
      },
    });
  });

  it("routes a hash-bound semantic mutation through the fixed protocol", async () => {
    const { projectRoot, appUIModelSource } = await createProject();

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "mutate_app_ui_model",
        input: {
          appUIModelHash: createHash("sha256")
            .update(appUIModelSource)
            .digest("hex"),
          operations: [
            {
              type: "update_instance_props",
              instanceId: "sample-main",
              set: { title: "Updated through control" },
            },
          ],
        },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        changedPaths: ["app-ui/app-ui.json"],
        diff: { instances: { updated: ["sample-main"] } },
      },
    });
    expect(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    ).toContain("Updated through control");
  });

  it("bounds plugin source while preserving precise asset and instance metadata", async () => {
    const source = `export default {};\n${"// detail\n".repeat(
      MAX_PLUGIN_SOURCE_CHARACTERS,
    )}`;
    const { projectRoot } = await createProject(source);

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "inspect_ui_plugin",
        input: { pluginId: "sample" },
      },
      projectRoot,
    );

    expect(response.ok).toBe(true);
    expect(response).toMatchObject({
      result: {
        selected: true,
        asset: { pluginId: "sample" },
        instances: [expect.objectContaining({ id: "sample-main" })],
        definitionSource: {
          truncated: true,
          content: expect.any(String),
        },
      },
    });
  });

  it("returns a Plugin Service dependency summary", async () => {
    const { projectRoot } = await createProject(
      "const REQUIRED = \"workspace.files\" as const;\n" +
        "const OPTIONAL = \"agent-ui.theme\" as const;\n" +
        "const Component = () => null;\n" +
        "export default { manifest: {}, inject: [REQUIRED], optionalInject: [OPTIONAL], Component };\n",
    );

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "inspect_ui_plugin",
        input: { pluginId: "sample" },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        services: {
          provides: [],
          required: ["workspace.files"],
          optional: ["agent-ui.theme"],
        },
      },
    });
  });

  it("routes the complete Service topology inspection", async () => {
    const { projectRoot } = await createProject(
      "const OPTIONAL = \"agent-ui.theme\" as const;\n" +
        "const Component = () => null;\n" +
        "export default { manifest: {}, optionalInject: [OPTIONAL], Component };\n",
    );

    const response = await handleUIProjectControlRequest(
      { schemaVersion: 3, operation: "inspect_ui_services", input: {} },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        services: [
          expect.objectContaining({
            name: "agent-ui.theme",
            status: "optional-unavailable",
          }),
        ],
        plugins: [
          expect.objectContaining({
            pluginId: "sample",
            optionalInject: ["agent-ui.theme"],
          }),
        ],
        issues: [],
      },
    });
  });

  it("routes target-owned plugin source reference analysis", async () => {
    const { projectRoot } = await createProject();
    await mkdir(path.join(projectRoot, "plugins", "consumer"));
    await writeFile(
      path.join(projectRoot, "plugins", "consumer", "index.ts"),
      'import sample from "../sample/definition";\nexport { sample };\n',
    );

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "inspect_ui_plugin_source_references",
        input: { pluginId: "sample" },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        pluginId: "sample",
        directory: "sample",
        references: expect.arrayContaining([
          expect.objectContaining({
            path: "plugins/consumer/index.ts",
            kind: "module",
          }),
        ]),
      },
    });
  });

  it("inspects and applies Agent UI source items through protocol v3", async () => {
    const { projectRoot } = await createProject();
    const inspected = await handleUIProjectControlRequest(
      { schemaVersion: 3, operation: "inspect_agent_ui_sources", input: {} },
      projectRoot,
    );
    expect(inspected).toMatchObject({
      ok: true,
      result: {
        stateHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        sourceRoot: "agent-ui",
      },
    });
    if (!inspected.ok) throw new Error("Expected Agent UI source inspection.");
    const stateHash = (inspected.result as { stateHash: string }).stateHash;

    const applied = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "apply_agent_ui_source_item",
        input: { itemId: "primitive/button", expectedStateHash: stateHash },
      },
      projectRoot,
    );

    expect(applied).toMatchObject({
      ok: true,
      result: {
        changed: true,
        changedItems: ["foundation/core", "primitive/button"],
      },
    });
    expect(
      JSON.parse(
        await readFile(path.join(projectRoot, ".agent-ui/source-lock.json"), "utf8"),
      ),
    ).toMatchObject({
      schemaVersion: 1,
      items: { "primitive/button": { version: "0.2.1" } },
    });
  });

  it("returns customized dependency conflicts through protocol v3", async () => {
    const { projectRoot } = await createProject();
    const initial = await handleUIProjectControlRequest(
      { schemaVersion: 3, operation: "inspect_agent_ui_sources", input: {} },
      projectRoot,
    );
    if (!initial.ok) throw new Error("Expected Agent UI source inspection.");
    await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "apply_agent_ui_source_item",
        input: {
          itemId: "foundation/core",
          expectedStateHash: (initial.result as { stateHash: string }).stateHash,
        },
      },
      projectRoot,
    );
    const dependencyPath = path.join(projectRoot, "agent-ui/foundation/context.ts");
    await writeFile(
      dependencyPath,
      `${await readFile(dependencyPath, "utf8")}\n// customized\n`,
    );
    const lockPath = path.join(projectRoot, ".agent-ui/source-lock.json");
    const lock = JSON.parse(await readFile(lockPath, "utf8")) as {
      items: Record<string, { version: string }>;
    };
    lock.items["foundation/core"]!.version = "0.0.0";
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    const beforeDependency = await readFile(dependencyPath, "utf8");
    const beforeLock = await readFile(lockPath, "utf8");
    const inspected = await handleUIProjectControlRequest(
      { schemaVersion: 3, operation: "inspect_agent_ui_sources", input: {} },
      projectRoot,
    );
    if (!inspected.ok) throw new Error("Expected Agent UI source inspection.");

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "apply_agent_ui_source_item",
        input: {
          itemId: "primitive/dialog",
          expectedStateHash: (inspected.result as { stateHash: string }).stateHash,
        },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      schemaVersion: 3,
      ok: false,
      error: {
        code: "AGENT_UI_SOURCE_CUSTOMIZED_DEPENDENCY",
        details: {
          requestedItemId: "primitive/dialog",
          dependencyItemId: "foundation/core",
          installedVersion: "0.0.0",
          requiredVersion: "0.2.2",
        },
      },
    });
    expect(await readFile(dependencyPath, "utf8")).toBe(beforeDependency);
    expect(await readFile(lockPath, "utf8")).toBe(beforeLock);
    await expect(
      readFile(path.join(projectRoot, ".agent-ui/source-transaction.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports incompatible requests and missing plugins as structured errors", async () => {
    const { projectRoot } = await createProject();

    const incompatible = await handleUIProjectControlRequest(
      { schemaVersion: 2, operation: "inspect_ui_project", input: {} },
      projectRoot,
    );
    const missing = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "inspect_ui_plugin",
        input: { pluginId: "missing" },
      },
      projectRoot,
    );

    expect(incompatible).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(missing).toMatchObject({
      ok: false,
      error: { code: "UI_PLUGIN_NOT_FOUND" },
    });
  });
});
