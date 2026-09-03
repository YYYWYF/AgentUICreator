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
};

async function createProject(definitionSource = "export default {};\n") {
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
    slots: {
      main: {
        id: "main",
        kind: "single",
        scope: "root",
        description: "Main fixture slot",
        owner: { type: "layout", nodeId: "main-node" },
        occupants: [{ instanceId: "sample-main" }],
      },
    },
    pluginInstances: {
      "sample-main": {
        id: "sample-main",
        pluginId: "sample",
        enabled: true,
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
      { schemaVersion: 2, operation: "inspect_ui_project", input: {} },
      projectRoot,
    );

    expect(response.ok).toBe(true);
    expect(response).toMatchObject({
      schemaVersion: 2,
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
      { schemaVersion: 2, operation: "inspect_app_ui_model", input: {} },
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

  it("returns compact Slot trees and exact Slot contracts", async () => {
    const { projectRoot } = await createProject();

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 2,
        operation: "inspect_ui_slots",
        input: { root: "main" },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        trees: [
          expect.objectContaining({
            slotId: "main",
            kind: "single",
            scope: "root",
          }),
        ],
        selected: expect.objectContaining({
          slotId: "main",
          declarer: { type: "layout", nodeId: "main-node" },
          occupants: [
            expect.objectContaining({
              instanceId: "sample-main",
              pluginId: "sample",
              enabled: true,
            }),
          ],
          replaceRisk: "replaces-occupant",
        }),
      },
    });
  });

  it("routes a hash-bound semantic mutation through the fixed protocol", async () => {
    const { projectRoot, appUIModelSource } = await createProject();

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 2,
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
        schemaVersion: 2,
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

  it("routes target-owned plugin source reference analysis", async () => {
    const { projectRoot } = await createProject();
    await mkdir(path.join(projectRoot, "plugins", "consumer"));
    await writeFile(
      path.join(projectRoot, "plugins", "consumer", "index.ts"),
      'import sample from "../sample/definition";\nexport { sample };\n',
    );

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 2,
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

  it("reports incompatible requests and missing plugins as structured errors", async () => {
    const { projectRoot } = await createProject();

    const incompatible = await handleUIProjectControlRequest(
      { schemaVersion: 3, operation: "inspect_ui_project", input: {} },
      projectRoot,
    );
    const missing = await handleUIProjectControlRequest(
      {
        schemaVersion: 2,
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
