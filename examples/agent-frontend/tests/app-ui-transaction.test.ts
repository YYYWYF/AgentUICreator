import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AppUIModel } from "../framework/contracts/app-ui-model";
import {
  mutateAppUIModel,
  recoverPendingAppUITransaction,
} from "../scripts/ui-project/app-ui-transaction";
import {
  GENERATED_PLUGIN_REGISTRY_PATH,
  generatePluginRegistry,
} from "../scripts/ui-project/registry-generator";

const temporaryProjects: string[] = [];

function hash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

async function createPlugin(
  projectRoot: string,
  pluginId: string,
  capability: "visual" | "headless",
): Promise<void> {
  const pluginRoot = path.join(projectRoot, "plugins", pluginId);
  await mkdir(pluginRoot, { recursive: true });
  await writeFile(
    path.join(pluginRoot, "manifest.json"),
    JSON.stringify({
      id: pluginId,
      name: pluginId,
      description: "Fixture",
      version: "1.0.0",
      capabilities: [capability],
    }),
  );
  await writeFile(
    path.join(pluginRoot, "definition.ts"),
    "const definition = {};\nexport default definition;\n",
  );
}

async function createProject(): Promise<{
  projectRoot: string;
  appUIModelSource: string;
  registrySource: string;
}> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "app-ui-transaction-"));
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "app-ui"));
  await mkdir(path.join(projectRoot, "plugins"));
  await createPlugin(projectRoot, "sample", "visual");
  await createPlugin(projectRoot, "replacement", "visual");
  await createPlugin(projectRoot, "background", "headless");
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
        kind: "list",
        scope: "root",
        description: "Main fixture slot",
        owner: { type: "layout", nodeId: "main-node" },
        occupants: [{ id: "primary", instanceId: "sample-main" }],
      },
    },
    pluginInstances: {
      "sample-main": {
        id: "sample-main",
        pluginId: "sample",
        enabled: true,
        props: { title: "Before" },
      },
    },
  };
  const appUIModelSource = `${JSON.stringify(model, null, 2)}\n`;
  await writeFile(
    path.join(projectRoot, "app-ui", "app-ui.json"),
    appUIModelSource,
  );
  const registry = await generatePluginRegistry(projectRoot, model);
  expect(registry.errors).toEqual([]);
  const registrySource = registry.source;
  await writeFile(
    path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH),
    registrySource,
  );
  return { projectRoot, appUIModelSource, registrySource };
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

describe("AppUIModel transaction", () => {
  it("commits a valid multi-operation change and returns a structured diff", async () => {
    const { projectRoot, appUIModelSource } = await createProject();

    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(appUIModelSource),
      operations: [
        {
          type: "add_instance",
          instance: {
            id: "sample-secondary",
            pluginId: "sample",
            enabled: true,
          },
        },
        {
          type: "mount_instance",
          instanceId: "sample-secondary",
          slotId: "main",
          id: "secondary",
        },
      ],
    });

    expect(result.changedPaths).toEqual(["app-ui/app-ui.json"]);
    expect(result.diff.instances.added).toEqual(["sample-secondary"]);
    expect(result.snapshotToken.appUIModelHash).toBe(result.appUIModel.afterHash);
    expect(
      JSON.parse(
        await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
      ),
    ).toMatchObject({
      pluginInstances: {
        "sample-secondary": { enabled: true },
      },
    });
  });

  it("rejects a stale hash and leaves both transaction files byte-identical", async () => {
    const { projectRoot, appUIModelSource, registrySource } = await createProject();

    await expect(
      mutateAppUIModel(projectRoot, {
        appUIModelHash: "0".repeat(64),
        operations: [
          {
            type: "update_instance_props",
            instanceId: "sample-main",
            set: { title: "After" },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "APP_UI_MODEL_HASH_CONFLICT" });
    expect(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    ).toBe(appUIModelSource);
    expect(
      await readFile(path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH), "utf8"),
    ).toBe(registrySource);
  });

  it("rejects invalid mount semantics and Registry generation before writing", async () => {
    const { projectRoot, appUIModelSource, registrySource } = await createProject();

    await expect(
      mutateAppUIModel(projectRoot, {
        appUIModelHash: hash(appUIModelSource),
        operations: [
          { type: "unmount_instance", instanceId: "sample-main" },
        ],
      }),
    ).rejects.toMatchObject({ code: "ENABLED_VISUAL_INSTANCE_UNMOUNTED" });
    await expect(
      mutateAppUIModel(projectRoot, {
        appUIModelHash: hash(appUIModelSource),
        operations: [
          {
            type: "add_instance",
            instance: {
              id: "missing-main",
              pluginId: "missing",
              enabled: false,
            },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "PLUGIN_REGISTRY_GENERATION_FAILED" });
    expect(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    ).toBe(appUIModelSource);
    expect(
      await readFile(path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH), "utf8"),
    ).toBe(registrySource);
  });

  it("allows disabled visual and enabled headless instances to remain unmounted", async () => {
    const { projectRoot, appUIModelSource } = await createProject();

    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(appUIModelSource),
      operations: [
        { type: "set_instance_enabled", instanceId: "sample-main", enabled: false },
        { type: "unmount_instance", instanceId: "sample-main" },
        {
          type: "add_instance",
          instance: {
            id: "background-main",
            pluginId: "background",
            enabled: true,
          },
        },
      ],
    });

    expect(result.registry.selectedPluginIds).toEqual(["background", "sample"]);
    expect(result.changedPaths).toEqual([
      "app-ui/app-ui.json",
      "plugins/registry.generated.ts",
    ]);
  });

  it("keeps source for hide, instance removal, and replacement semantics", async () => {
    const hidden = await createProject();
    const hiddenResult = await mutateAppUIModel(hidden.projectRoot, {
      appUIModelHash: hash(hidden.appUIModelSource),
      operations: [
        {
          type: "set_instance_enabled",
          instanceId: "sample-main",
          enabled: false,
        },
        { type: "unmount_instance", instanceId: "sample-main" },
      ],
    });
    expect(hiddenResult.registry.selectedPluginIds).toEqual(["sample"]);
    await expect(
      readFile(
        path.join(hidden.projectRoot, "plugins", "sample", "definition.ts"),
        "utf8",
      ),
    ).resolves.toContain("export default");

    const removed = await createProject();
    const removedResult = await mutateAppUIModel(removed.projectRoot, {
      appUIModelHash: hash(removed.appUIModelSource),
      operations: [
        { type: "unmount_instance", instanceId: "sample-main" },
        { type: "remove_instance", instanceId: "sample-main" },
      ],
    });
    expect(removedResult.registry.selectedPluginIds).toEqual([]);
    await expect(
      readFile(
        path.join(removed.projectRoot, "plugins", "sample", "definition.ts"),
        "utf8",
      ),
    ).resolves.toContain("export default");

    const replaced = await createProject();
    const replacedResult = await mutateAppUIModel(replaced.projectRoot, {
      appUIModelHash: hash(replaced.appUIModelSource),
      operations: [
        {
          type: "replace_instance",
          instanceId: "sample-main",
          replacement: {
            id: "replacement-main",
            pluginId: "replacement",
            enabled: true,
          },
        },
      ],
    });
    expect(replacedResult.registry.selectedPluginIds).toEqual(["replacement"]);
    await expect(
      readFile(
        path.join(replaced.projectRoot, "plugins", "sample", "definition.ts"),
        "utf8",
      ),
    ).resolves.toContain("export default");
    await expect(
      readFile(
        path.join(
          replaced.projectRoot,
          "plugins",
          "replacement",
          "definition.ts",
        ),
        "utf8",
      ),
    ).resolves.toContain("export default");
  });

  it("serializes concurrent mutations and rechecks the hash inside the lock", async () => {
    const { projectRoot, appUIModelSource } = await createProject();
    const input = (title: string) => ({
      appUIModelHash: hash(appUIModelSource),
      operations: [
        {
          type: "update_instance_props" as const,
          instanceId: "sample-main",
          set: { title },
        },
      ],
    });

    const settled = await Promise.allSettled([
      mutateAppUIModel(projectRoot, input("First")),
      mutateAppUIModel(projectRoot, input("Second")),
    ]);

    expect(settled.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.find((item) => item.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: { code: "APP_UI_MODEL_HASH_CONFLICT" },
    });
  });

  it("does not rewrite files for a semantic no-op", async () => {
    const { projectRoot, appUIModelSource, registrySource } = await createProject();

    const result = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(appUIModelSource),
      operations: [
        { type: "set_instance_enabled", instanceId: "sample-main", enabled: true },
      ],
    });

    expect(result.changed).toBe(false);
    expect(result.changedPaths).toEqual([]);
    expect(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    ).toBe(appUIModelSource);
    expect(
      await readFile(path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH), "utf8"),
    ).toBe(registrySource);
  });

  it("finishes a journaled two-file transaction after an interrupted rename", async () => {
    const { projectRoot, appUIModelSource } = await createProject();

    await expect(
      mutateAppUIModel(
        projectRoot,
        {
          appUIModelHash: hash(appUIModelSource),
          operations: [
            {
              type: "add_instance",
              instance: {
                id: "background-main",
                pluginId: "background",
                enabled: true,
              },
            },
          ],
        },
        { simulateCrashAfterRename: 1 },
      ),
    ).rejects.toThrow("Simulated AppUI transaction crash");

    await recoverPendingAppUITransaction(projectRoot);
    const model = JSON.parse(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    ) as AppUIModel;
    const registry = await readFile(
      path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH),
      "utf8",
    );
    expect(model.pluginInstances["background-main"]).toMatchObject({
      enabled: true,
    });
    expect(registry).toContain('./background/definition');
  });
});
