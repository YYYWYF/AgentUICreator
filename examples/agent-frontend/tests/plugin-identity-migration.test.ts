import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  parseAppUIModel,
  parseAppUIModelJson,
  parseAppUIModelJsonWithMigrations,
  type AppUIModel,
} from "../framework/contracts/app-ui-model";
import {
  migratePersistedAppUIModelInput,
} from "../framework/contracts/app-ui-model-migrations";
import {
  mutateAppUIModel,
} from "../scripts/ui-project/app-ui-transaction";
import { inspectUIProject } from "../scripts/ui-project/project-inspector";
import {
  GENERATED_PLUGIN_REGISTRY_PATH,
  generatePluginRegistry,
  PLUGIN_REGISTRY_ENTRY_PATH,
  PLUGIN_REGISTRY_ENTRY_SOURCE,
} from "../scripts/ui-project/registry-generator";
import type { UIProjectControlConfig } from "../scripts/ui-project/types";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryProjects: string[] = [];
const legacyPluginId = "antd-x-sender";
const canonicalPluginId = "agent-composer";
const fixtureConfig: UIProjectControlConfig = {
  catalogs: ["plugins/catalog"],
  uiPackages: [],
  agentUI: { sourceRoot: "agent-ui", metadataRoot: ".agent-ui" },
};

function hash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function legacyModel(): AppUIModel {
  return {
    version: "2",
    root: { type: "slot", id: "main-node", slotId: "main" },
    pluginInstances: {
      "agent-sender-main": {
        id: "agent-sender-main",
        pluginId: legacyPluginId,
        enabled: true,
        mount: { slotId: "main", order: 2 },
        props: { text: legacyPluginId, preserved: true },
      },
    },
    settings: { theme: "system" },
  };
}

async function createLegacyProject(): Promise<{
  projectRoot: string;
  source: string;
}> {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "plugin-id-migration-"));
  temporaryProjects.push(fixtureRoot);
  await mkdir(path.join(fixtureRoot, "app-ui"));
  await mkdir(path.join(fixtureRoot, "plugins", canonicalPluginId), {
    recursive: true,
  });
  await writeFile(path.join(fixtureRoot, "package.json"), "{}\n");
  await writeFile(
    path.join(fixtureRoot, "plugins", canonicalPluginId, "manifest.json"),
    `${JSON.stringify({
      id: canonicalPluginId,
      name: "Agent Composer",
      description: "Fixture composer",
      version: "1.2.0",
      capabilities: ["message-input"],
    }, null, 2)}\n`,
  );
  await writeFile(
    path.join(fixtureRoot, "plugins", canonicalPluginId, "definition.ts"),
    "const definition = {};\nexport default definition;\n",
  );
  await writeFile(
    path.join(fixtureRoot, "plugins", canonicalPluginId, "index.tsx"),
    "export function AgentComposerPlugin() { return null; }\n",
  );
  const source = `${JSON.stringify(legacyModel(), null, 2)}\n`;
  await writeFile(path.join(fixtureRoot, "app-ui", "app-ui.json"), source);
  const canonicalModel = parseAppUIModelJson(source);
  const registry = await generatePluginRegistry(
    fixtureRoot,
    canonicalModel,
    fixtureConfig,
  );
  await writeFile(
    path.join(fixtureRoot, GENERATED_PLUGIN_REGISTRY_PATH),
    registry.source,
  );
  await writeFile(
    path.join(fixtureRoot, PLUGIN_REGISTRY_ENTRY_PATH),
    PLUGIN_REGISTRY_ENTRY_SOURCE,
  );
  return { projectRoot: fixtureRoot, source };
}

async function collectPolicyFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return ["node_modules", "dist", "coverage"].includes(entry.name)
        ? []
        : collectPolicyFiles(entryPath);
    }
    return entry.isFile() && /\.(?:css|json|md|ts|tsx)$/u.test(entry.name)
      ? [entryPath]
      : [];
  }));
  return files.flat();
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((fixtureRoot) =>
      rm(fixtureRoot, { recursive: true, force: true }),
    ),
  );
});

describe("persisted AppUIModel plugin identity migration", () => {
  it("maps the exact legacy plugin id without changing other model fields", () => {
    const input = legacyModel();
    const result = migratePersistedAppUIModelInput(input);

    expect(result.input).not.toBe(input);
    expect(result.input).toEqual({
      ...input,
      pluginInstances: {
        "agent-sender-main": {
          ...input.pluginInstances["agent-sender-main"],
          pluginId: canonicalPluginId,
        },
      },
    });
    expect(input.pluginInstances["agent-sender-main"]?.pluginId).toBe(
      legacyPluginId,
    );
    expect(
      (result.input as AppUIModel).pluginInstances["agent-sender-main"]?.props,
    ).toEqual({ text: legacyPluginId, preserved: true });
    expect(result.migrations).toEqual([{
      type: "plugin-id",
      instanceId: "agent-sender-main",
      from: legacyPluginId,
      to: canonicalPluginId,
    }]);
  });

  it("is a no-op for canonical, unknown, and malformed representations", () => {
    for (const pluginId of [canonicalPluginId, "custom-agent-composer"]) {
      const input = legacyModel();
      input.pluginInstances["agent-sender-main"]!.pluginId = pluginId;
      const result = migratePersistedAppUIModelInput(input);
      expect(result).toEqual({ input, migrations: [] });
      expect(result.input).toBe(input);
    }

    for (const input of [
      null,
      [],
      { pluginInstances: [] },
      { pluginInstances: { sender: null } },
      { pluginInstances: { sender: { pluginId: 42 } } },
    ]) {
      const result = migratePersistedAppUIModelInput(input);
      expect(result).toEqual({ input, migrations: [] });
      expect(result.input).toBe(input);
    }
  });

  it("migrates persisted JSON while keeping canonical parsing strict", () => {
    const input = legacyModel();
    const parsed = parseAppUIModelJsonWithMigrations(JSON.stringify(input));

    expect(parsed.model.pluginInstances["agent-sender-main"]?.pluginId).toBe(
      canonicalPluginId,
    );
    expect(parseAppUIModelJson(JSON.stringify(input))).toEqual(parsed.model);
    expect(parseAppUIModel(input).pluginInstances["agent-sender-main"]?.pluginId)
      .toBe(legacyPluginId);
    expect(parsed.migrations).toHaveLength(1);
  });
});

describe("legacy project compatibility", () => {
  it("generates the canonical Registry from a legacy persisted model", async () => {
    const { projectRoot: fixtureRoot, source } = await createLegacyProject();
    const result = await generatePluginRegistry(
      fixtureRoot,
      parseAppUIModelJson(source),
      fixtureConfig,
    );

    expect(result.selectedPluginIds).toEqual([canonicalPluginId]);
    expect(result.registeredPluginIds).toEqual([canonicalPluginId]);
    expect(result.errors).toEqual([]);
    expect(result.source).toContain('./agent-composer/definition');
    expect(result.source).not.toContain(legacyPluginId);
  });

  it("inspects canonical identity while hashing the raw persisted source", async () => {
    const { projectRoot: fixtureRoot, source } = await createLegacyProject();
    const result = await inspectUIProject(fixtureRoot, fixtureConfig);

    expect(result.appUIModel.hash).toBe(hash(source));
    expect(result.pluginInstances).toContainEqual(
      expect.objectContaining({
        id: "agent-sender-main",
        pluginId: canonicalPluginId,
      }),
    );
    expect(result.registry.selectedPluginIds).toEqual([canonicalPluginId]);
    expect(result.registry.registeredPluginIds).toEqual([canonicalPluginId]);
    expect(result.registry.issues).toEqual([]);
  });

  it("writes canonical identity through a semantically unchanged transaction", async () => {
    const { projectRoot: fixtureRoot, source } = await createLegacyProject();
    const result = await mutateAppUIModel(fixtureRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "set_instance_enabled",
        instanceId: "agent-sender-main",
        enabled: true,
      }],
    });
    const persisted = JSON.parse(
      await readFile(path.join(fixtureRoot, "app-ui", "app-ui.json"), "utf8"),
    ) as AppUIModel;

    expect(result.changedPaths).toEqual(["app-ui/app-ui.json"]);
    expect(persisted.pluginInstances["agent-sender-main"]).toEqual({
      id: "agent-sender-main",
      pluginId: canonicalPluginId,
      enabled: true,
      mount: { slotId: "main", order: 2 },
      props: {
        text: legacyPluginId,
        preserved: true,
      },
    });
    expect(persisted.settings).toEqual({ theme: "system" });
  });
});

describe("canonical Composer identity policy", () => {
  it("keeps the canonical directory, manifest, and generated Registry", async () => {
    await expect(stat(path.join(projectRoot, "plugins", "antd-x-sender")))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(path.join(projectRoot, "plugins", canonicalPluginId)))
      .resolves.toMatchObject({});
    const manifest = JSON.parse(
      await readFile(
        path.join(projectRoot, "plugins", canonicalPluginId, "manifest.json"),
        "utf8",
      ),
    ) as { id: string };
    const registry = await readFile(
      path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH),
      "utf8",
    );

    expect(manifest.id).toBe(canonicalPluginId);
    expect(registry).toContain('./agent-composer/definition');
    expect(registry).not.toContain(legacyPluginId);
  });

  it("confines legacy identity knowledge to migration compatibility files", async () => {
    const allowed = new Set([
      path.join(projectRoot, "framework", "contracts", "app-ui-model-migrations.ts"),
      fileURLToPath(import.meta.url),
    ]);
    const violations: string[] = [];

    for (const filePath of await collectPolicyFiles(projectRoot)) {
      if (allowed.has(filePath)) {
        continue;
      }
      const source = await readFile(filePath, "utf8");
      if (/antd-x-sender|AntdXSender|antdXSender/u.test(source)) {
        violations.push(path.relative(projectRoot, filePath));
      }
    }

    expect(violations).toEqual([]);
  });
});
