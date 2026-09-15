import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AppUIModel } from "../framework/contracts/app-ui-model";
import { mutateAppUIModel } from "../scripts/ui-project/app-ui-transaction";
import {
  GENERATED_PLUGIN_REGISTRY_PATH,
  generatePluginRegistry,
} from "../scripts/ui-project/registry-generator";

const temporaryProjects: string[] = [];
const hash = (source: string) => createHash("sha256").update(source).digest("hex");

async function createPlugin(projectRoot: string, pluginId: string): Promise<void> {
  const pluginRoot = path.join(projectRoot, "plugins", pluginId);
  await mkdir(pluginRoot, { recursive: true });
  await writeFile(path.join(pluginRoot, "manifest.json"), JSON.stringify({
    id: pluginId,
    name: pluginId,
    description: "Fixture plugin.",
    version: "1.0.0",
  }));
  await writeFile(
    path.join(pluginRoot, "definition.ts"),
    "const definition = {};\nexport default definition;\n",
  );
}

async function createProject() {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "app-ui-transaction-"));
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "app-ui"));
  await mkdir(path.join(projectRoot, "plugins"));
  await createPlugin(projectRoot, "sample");
  const model: AppUIModel = {
    root: {
      type: "slot",
      plugins: [{
        id: "sample-main",
        pluginId: "sample",
        enabled: true,
        props: { title: "Before" },
      }],
    },
  };
  const source = `${JSON.stringify(model, null, 2)}\n`;
  await writeFile(path.join(projectRoot, "app-ui", "app-ui.json"), source);
  const registry = await generatePluginRegistry(projectRoot, model);
  await writeFile(path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH), registry.source);
  return { projectRoot, source };
}

afterEach(async () => {
  await Promise.all(temporaryProjects.splice(0).map((root) =>
    rm(root, { recursive: true, force: true }),
  ));
});

describe("AppUIModel transaction", () => {
  it("commits the authoring model only after it compiles", async () => {
    const { projectRoot, source } = await createProject();
    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "update_plugin_props",
        instanceId: "sample-main",
        set: { title: "After" },
      }],
    });

    expect(result.changed).toBe(true);
    expect(result.diff.plugins.updated).toEqual(["sample-main"]);
    const written = JSON.parse(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    ) as AppUIModel;
    if (written.root.type !== "slot") throw new Error("fixture");
    expect(written.root.plugins[0]?.props?.title).toBe("After");
  });

  it("does not write a draft that fails deterministic compilation", async () => {
    const { projectRoot, source } = await createProject();
    await expect(mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "insert_plugin",
        plugin: { id: "missing-main", pluginId: "missing", enabled: true },
        target: { type: "layout_slot", slotRef: "l0" },
      }],
    })).rejects.toMatchObject({ code: "PLUGIN_REGISTRY_GENERATION_FAILED" });

    expect(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"))
      .toBe(source);
  });

  it("rejects a stale source hash before changing either transaction file", async () => {
    const { projectRoot, source } = await createProject();
    const registryPath = path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH);
    const registrySource = await readFile(registryPath, "utf8");

    await expect(mutateAppUIModel(projectRoot, {
      appUIModelHash: "0".repeat(64),
      operations: [{
        type: "set_plugin_enabled",
        instanceId: "sample-main",
        enabled: false,
      }],
    })).rejects.toMatchObject({ code: "APP_UI_MODEL_HASH_CONFLICT" });

    expect(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"))
      .toBe(source);
    expect(await readFile(registryPath, "utf8")).toBe(registrySource);
  });

  it("preserves source bytes for an already-satisfied semantic operation", async () => {
    const { projectRoot, source } = await createProject();
    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "set_plugin_enabled",
        instanceId: "sample-main",
        enabled: true,
      }],
    });

    expect(result.changed).toBe(false);
    expect(result.changedPaths).toEqual([]);
    expect(await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"))
      .toBe(source);
  });
});
