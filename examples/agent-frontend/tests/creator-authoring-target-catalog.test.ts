import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { legacyProjectPaths } from "./legacy-project-paths";

import {
  creatorApplicationAuthoringTargets,
  type CreatorApplicationAuthoringTarget,
} from "../agent-ui/authoring/creator-authoring-targets";
import {
  buildCreatorAuthoringTargetCatalog,
  validateCreatorAuthoringTargetBinding,
} from "../scripts/ui-project/creator-authoring-target-catalog";
import type {
  CreatorAuthoringTargetBinding,
  CreatorAuthoringTargetCandidate,
  PluginAsset,
  PluginProjectFacts,
  UIProjectControlConfig,
} from "../scripts/ui-project/types";

const fixtureRoots: string[] = [];
const config: UIProjectControlConfig = {
  catalogs: [],
  uiPackages: [],
  agentUI: { sourceRoot: "agent-ui", metadataRoot: ".agent-ui" },
};

afterEach(async () => {
  await Promise.all(fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "creator-authoring-targets-"));
  fixtureRoots.push(root);
  await mkdir(path.join(root, "agent-ui"), { recursive: true });
  await mkdir(path.join(root, "plugins"), { recursive: true });
  return root;
}

function emptyFacts(assets: PluginAsset[] = []): PluginProjectFacts {
  return { assets } as unknown as PluginProjectFacts;
}

function applicationTarget(
  overrides: Partial<CreatorApplicationAuthoringTarget> = {},
): CreatorApplicationAuthoringTarget {
  return {
    id: "test.application-config",
    kind: "application_config" as const,
    name: "Test application config",
    description: "Test application-owned configuration.",
    intents: ["change test application config"],
    ownerPath: "agent-ui/test-config.ts",
    ...overrides,
  };
}

async function writeApplicationOwner(root: string, ownerPath = "agent-ui/test-config.ts") {
  await writeFile(path.join(root, ownerPath), "export const value = true;\n");
}

describe("Creator Authoring Target Catalog", () => {
  it("publishes the three application targets with source-root bindings", async () => {
    const root = await createFixture();
    for (const declaration of creatorApplicationAuthoringTargets) {
      const ownerPath = path.join(root, "agent-ui", declaration.ownerPath);
      await mkdir(path.dirname(ownerPath), { recursive: true });
      await writeFile(ownerPath, "export const value = true;\n");
    }

    const catalog = await buildCreatorAuthoringTargetCatalog({
      projectRoot: root,
      config,
      paths: legacyProjectPaths(root, config),
      projectFacts: emptyFacts(),
    });

    expect(catalog.candidates.map((candidate) => candidate.id)).toEqual([
      "conversation.starter-suggestions",
      "conversation.welcome",
      "theme.default-mode",
    ]);
    expect(catalog.candidates.every((candidate) => candidate.kind === "application_config")).toBe(true);
    expect(catalog.bindings.every((binding) => binding.ownerPath?.startsWith("agent-ui/") === true)).toBe(true);
  });

  it("creates Plugin Source targets with implementation-only intents and bounded plugin ownership", async () => {
    const root = await createFixture();
    const pluginRoot = path.join(root, "plugins", "conversation-suggestions");
    await mkdir(pluginRoot, { recursive: true });
    await writeFile(path.join(pluginRoot, "definition.ts"), "export const definition = {};\n");
    await writeFile(path.join(pluginRoot, "manifest.json"), "{}\n");
    const asset: PluginAsset = {
      pluginId: "conversation-suggestions",
      manifest: {
        id: "conversation-suggestions",
        name: "Conversation Suggestions",
        description: "Starter prompts.",
        version: "1.0.0",
        authoring: {
          intents: ["show starter prompts and suggested conversation actions"],
        },
      },
      name: "Conversation Suggestions",
      description: "Starter prompts.",
      directory: "conversation-suggestions",
      manifestPath: "plugins/conversation-suggestions/manifest.json",
      definitionPath: "plugins/conversation-suggestions/definition.ts",
      capabilities: ["conversation-suggestions"],
    };

    const catalog = await buildCreatorAuthoringTargetCatalog({
      projectRoot: root,
      config,
      paths: legacyProjectPaths(root, config),
      projectFacts: emptyFacts([asset]),
      applicationTargets: [],
    });
    const source = catalog.candidates[0];
    const binding = catalog.bindings[0];

    expect(source).toMatchObject({
      id: "plugin-source:conversation-suggestions",
      kind: "plugin_source",
      relatedPluginIds: ["conversation-suggestions"],
    });
    expect(source?.intents).toEqual([
      "modify Conversation Suggestions rendering",
      "change Conversation Suggestions styling",
      "change Conversation Suggestions interaction",
      "change Conversation Suggestions behavior",
      "modify Conversation Suggestions implementation",
    ]);
    expect(source?.intents).not.toContain("show starter prompts and suggested conversation actions");
    expect(binding).toMatchObject({
      ownerRoot: "plugins/conversation-suggestions",
      definitionPath: "plugins/conversation-suggestions/definition.ts",
      manifestPath: "plugins/conversation-suggestions/manifest.json",
    });
  });

  it("rejects duplicate target ids and unknown related Plugins", async () => {
    const root = await createFixture();
    await writeApplicationOwner(root);
    const duplicate = applicationTarget();

    await expect(buildCreatorAuthoringTargetCatalog({
      projectRoot: root,
      config,
      paths: legacyProjectPaths(root, config),
      projectFacts: emptyFacts(),
      applicationTargets: [duplicate, duplicate],
    })).rejects.toThrow(/Duplicate authoring target id/);

    await expect(buildCreatorAuthoringTargetCatalog({
      projectRoot: root,
      config,
      paths: legacyProjectPaths(root, config),
      projectFacts: emptyFacts(),
      applicationTargets: [applicationTarget({ relatedPluginIds: ["missing-plugin"] })],
    })).rejects.toThrow(/unknown Plugin/);
  });

  it("rejects traversal outside the Agent UI source root", async () => {
    const root = await createFixture();

    await expect(buildCreatorAuthoringTargetCatalog({
      projectRoot: root,
      config,
      paths: legacyProjectPaths(root, config),
      projectFacts: emptyFacts(),
      applicationTargets: [applicationTarget({ ownerPath: "agent-ui/../outside.ts" })],
    })).rejects.toThrow(/normalized project-relative path/);
  });

  it("rejects a candidate and Host binding with different identity or kind", () => {
    const candidate: CreatorAuthoringTargetCandidate = {
      id: "test.application-config",
      kind: "application_config",
      name: "Test application config",
      description: "Test application-owned configuration.",
      intents: ["change test application config"],
    };
    const binding: CreatorAuthoringTargetBinding = {
      targetId: "plugin-source:test",
      kind: "plugin_source",
      ownerRoot: "plugins/test",
    };

    expect(() => validateCreatorAuthoringTargetBinding(
      candidate,
      binding,
      new Set(),
    )).toThrow(/mismatched Host binding/);
  });
});
