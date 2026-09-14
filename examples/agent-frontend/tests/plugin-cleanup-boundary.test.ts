import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("canonical assistant-ui cleanup boundary", () => {
  it("keeps exactly the seven supported plugin manifests", async () => {
    const pluginRoot = path.join(projectRoot, "plugins");
    const directories = (await readdir(pluginRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(directories).toEqual([
      "assistant-ui-suggestions",
      "assistant-ui-thread-list",
      "conversation-data-source",
      "conversation-service",
      "conversation-surface",
      "theme-provider",
      "theme-switch",
    ]);

    const manifests = await Promise.all(
      directories.map(async (directory) => JSON.parse(
        await readFile(path.join(pluginRoot, directory, "manifest.json"), "utf8"),
      ) as { id: string }),
    );
    expect(manifests.map(({ id }) => id).sort()).toEqual(directories);
    expect(directories.some((directory) => /^(agent-|antd-x-|.*template)/u.test(directory))).toBe(false);
  });

  it("keeps the generated registry and package boundary canonical", async () => {
    const [packageSource, registrySource, slotsSource] = await Promise.all([
      readFile(path.join(projectRoot, "package.json"), "utf8"),
      readFile(path.join(projectRoot, "plugins/registry.generated.ts"), "utf8"),
      readFile(path.join(projectRoot, "agent-ui/adapters/assistant-ui/slots/semantic-slots.ts"), "utf8"),
    ]);
    const packageJson = JSON.parse(packageSource) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(packageJson.dependencies ?? {}).some((name) => /^(antd|@ant-design\//u.test(name))).toBe(false);
    expect((registrySource.match(/manifest\.json/gu) ?? []).length).toBe(7);
    expect(registrySource).not.toMatch(/agent-|antd-x-|template-library/u);
    expect(slotsSource).not.toContain("LEGACY_ASSISTANT_UI_CONVERSATION_SLOTS");
    expect(slotsSource).toContain('welcome: "conversation.empty.welcome"');
    expect(slotsSource).toContain('suggestions: "conversation.empty.suggestions"');
  });
});
