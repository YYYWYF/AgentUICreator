import { generatedProjectFixture, repositoryRoot } from "../../../operator/tests/support/generated-project";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { officialPackagePlugins } from "../../src/catalog/package-plugins";
import { describe, expect, it } from "vitest";

import { pluginCapabilityCatalog } from "../../resources/registry/items/foundation/core/files/plugins/index";

const projectRoot = await generatedProjectFixture();
export const canonicalPluginIds = [...officialPackagePlugins.map(plugin => plugin.pluginId), "composer-trigger-demo"];
const forbiddenImplementationTokens = [
  "@assistant-ui/",
  "runtime-assistant-ui",
] as const;

async function collectFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(current, entry.name);
    return entry.isDirectory()
      ? collectFiles(root, absolutePath)
      : [path.relative(root, absolutePath).split(path.sep).join("/")];
  }));
  return files.flat().sort();
}

describe("canonical Conversation plugin cleanup boundary", () => {
  it("keeps supported Plugin manifests in the generated catalog", async () => {
    const pluginRoot = path.join(projectRoot, "plugins");
    const directories = (await readdir(pluginRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(directories.every(id => canonicalPluginIds.includes(id))).toBe(true);
    expect(directories.every(id => !id.startsWith("assistant-ui-") && id !== "message-footer")).toBe(true);
    const manifests = await Promise.all(
      directories.map(async (directory) => JSON.parse(
        await readFile(path.join(pluginRoot, directory, "manifest.json"), "utf8"),
      ) as { id: string }),
    );
    expect(manifests.map(({ id }) => id).sort()).toEqual(directories);
    const catalogIds = pluginCapabilityCatalog.list().map(({ manifest }) => manifest.id);
    expect(new Set(catalogIds).size).toBe(catalogIds.length);
    expect(catalogIds.every(id => canonicalPluginIds.includes(id))).toBe(true);
  });

  it("keeps production Plugin sources behind the generic public boundary", async () => {
    const pluginRoot = path.join(projectRoot, "plugins");
    const files = await collectFiles(pluginRoot);

    for (const relativePath of files) {
      const source = await readFile(path.join(pluginRoot, relativePath), "utf8");
      for (const token of forbiddenImplementationTokens) {
        expect(relativePath, token).not.toContain(token);
        expect(source, `${relativePath}: ${token}`).not.toContain(token);
      }
    }
  });

  it("keeps the generated registry and semantic Slot boundary canonical", async () => {
    const [packageSource, registrySource, pluginSource] = await Promise.all([
      readFile(path.join(projectRoot, "package.json"), "utf8"),
      readFile(path.join(projectRoot, "plugins/registry.generated.ts"), "utf8"),
      readFile(path.join(projectRoot, "plugins/conversation-surface/index.tsx"), "utf8"),
    ]);
    const packageJson = JSON.parse(packageSource) as {
      dependencies?: Record<string, string>;
    };

    expect(
      Object.keys(packageJson.dependencies ?? {}).some(
        (name) => name === "antd" || name.startsWith("@ant-design/"),
      ),
    ).toBe(false);
    expect(registrySource).not.toMatch(/antd-x-|template-library/u);
    expect(pluginSource).toContain("CanonicalConversationSurfacePlugin");
    const presentation = await readFile(path.join(repositoryRoot, "packages/plugins/src/plugins/conversation-surface/adapters/presentation/conversation-surface.tsx"), "utf8");
    expect(presentation).toContain('renderSlot("emptyWelcome"');
    expect(presentation).toContain('renderSlot("emptySuggestions"');
    expect(presentation).toContain('renderSlot("headerActions"');
  });
});
