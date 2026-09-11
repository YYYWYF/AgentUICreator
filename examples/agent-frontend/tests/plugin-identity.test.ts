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
  parseAppUIModelJson,
  type AppUIModel,
} from "../framework/contracts/app-ui-model";
import {
  mutateAppUIModel,
} from "../scripts/ui-project/app-ui-transaction";
import { collectPluginAssets } from "../scripts/ui-project/plugin-assets";
import { uiProjectControlConfig } from "../scripts/ui-project/project-config";
import { inspectUIProject } from "../scripts/ui-project/project-inspector";
import {
  GENERATED_PLUGIN_REGISTRY_PATH,
  generatePluginRegistry,
  PLUGIN_REGISTRY_ENTRY_PATH,
  PLUGIN_REGISTRY_ENTRY_SOURCE,
} from "../scripts/ui-project/registry-generator";
import type { UIProjectControlConfig } from "../scripts/ui-project/types";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(projectRoot, "../..");
const temporaryProjects: string[] = [];
const canonicalPluginId = "agent-composer";
const removedPluginId = ["antd", "x", "sender"].join("-");
const removedComponentName = ["Antd", "X", "Sender"].join("");
const removedDefinitionName = ["antd", "X", "Sender", "Plugin"].join("");
const fixtureConfig: UIProjectControlConfig = {
  catalogs: [],
  uiPackages: [],
  agentUI: { sourceRoot: "agent-ui", metadataRoot: ".agent-ui" },
};

function hash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

async function createCanonicalProject(): Promise<{
  projectRoot: string;
  source: string;
}> {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "plugin-identity-"));
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
  const model: AppUIModel = {
    version: "2",
    root: { type: "slot", id: "main-node", slotId: "main" },
    pluginInstances: {
      "agent-sender-main": {
        id: "agent-sender-main",
        pluginId: canonicalPluginId,
        enabled: true,
        mount: { slotId: "main", order: 2 },
        props: { placeholder: "Before" },
      },
    },
  };
  const source = `${JSON.stringify(model, null, 2)}\n`;
  await writeFile(path.join(fixtureRoot, "app-ui", "app-ui.json"), source);
  const registry = await generatePluginRegistry(
    fixtureRoot,
    parseAppUIModelJson(source),
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
      return [
        ".git",
        ".venv",
        ".agentuicreator",
        "build",
        "coverage",
        "dist",
        "node_modules",
      ].includes(entry.name)
        ? []
        : collectPolicyFiles(entryPath);
    }
    return entry.isFile() &&
      /\.(?:css|json|jsonl|md|mjs|py|toml|ts|tsx|txt|yaml|yml)$/u.test(entry.name)
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

describe("canonical Composer identity", () => {
  it("keeps one canonical directory, manifest, model identity, and Registry entry", async () => {
    await expect(stat(path.join(projectRoot, "plugins", removedPluginId)))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(path.join(projectRoot, "plugins", canonicalPluginId)))
      .resolves.toMatchObject({});

    const manifest = JSON.parse(
      await readFile(
        path.join(projectRoot, "plugins", canonicalPluginId, "manifest.json"),
        "utf8",
      ),
    ) as { id: string; name: string };
    expect(manifest).toMatchObject({
      id: canonicalPluginId,
      name: "Agent Composer",
    });

    const model = parseAppUIModelJson(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    );
    expect(model.pluginInstances["agent-sender-main"]?.pluginId).toBe(
      canonicalPluginId,
    );

    const registry = await readFile(
      path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH),
      "utf8",
    );
    expect(registry).toContain(`./${canonicalPluginId}/definition`);
    expect(registry).not.toContain(removedPluginId);

    const inventory = await collectPluginAssets(
      projectRoot,
      uiProjectControlConfig,
    );
    expect(
      inventory.assets.filter((asset) => asset.pluginId === canonicalPluginId),
    ).toEqual([
      expect.objectContaining({
        pluginId: canonicalPluginId,
        directory: canonicalPluginId,
      }),
    ]);
  });

  it("exposes only the canonical identity through project inspection", async () => {
    const inspection = await inspectUIProject(projectRoot);

    expect(inspection.pluginInstances).toContainEqual(
      expect.objectContaining({
        id: "agent-sender-main",
        pluginId: canonicalPluginId,
      }),
    );
    expect(inspection.registry.selectedPluginIds).toContain(canonicalPluginId);
    expect(inspection.registry.registeredPluginIds).toContain(canonicalPluginId);
  });

  it("preserves the canonical identity through a normal AppUI transaction", async () => {
    const { projectRoot: fixtureRoot, source } = await createCanonicalProject();
    const result = await mutateAppUIModel(fixtureRoot, {
      appUIModelHash: hash(source),
      operations: [{
        type: "update_instance_props",
        instanceId: "agent-sender-main",
        set: { placeholder: "After" },
      }],
    });
    const persisted = parseAppUIModelJson(
      await readFile(path.join(fixtureRoot, "app-ui", "app-ui.json"), "utf8"),
    );

    expect(result.changedPaths).toEqual(["app-ui/app-ui.json"]);
    expect(result.registry.selectedPluginIds).toEqual([canonicalPluginId]);
    expect(result.registry.registeredPluginIds).toEqual([canonicalPluginId]);
    expect(persisted.pluginInstances["agent-sender-main"]).toMatchObject({
      pluginId: canonicalPluginId,
      props: { placeholder: "After" },
    });
  });

  it("keeps removed Composer identities out of normal repository source", async () => {
    const forbiddenIdentities = [
      removedPluginId,
      removedComponentName,
      removedDefinitionName,
    ];
    const violations: string[] = [];
    const policyRoots = [
      path.join(repositoryRoot, "examples", "agent-frontend"),
      path.join(repositoryRoot, "packages", "creator-python"),
      path.join(repositoryRoot, "docs"),
    ];

    for (const policyRoot of policyRoots) {
      for (const filePath of await collectPolicyFiles(policyRoot)) {
        const source = await readFile(filePath, "utf8");
        if (forbiddenIdentities.some((identity) => source.includes(identity))) {
          violations.push(path.relative(repositoryRoot, filePath));
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
