import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeGeneratedPluginRegistry } from "../../src/generate-plugin-registry";
import { inspectCreatorProject } from "../../src/project/creator-project-inspector";
import { inspectUIProject } from "../../src/project/project-inspector";
import { PLUGIN_REGISTRY_ENTRY_SOURCE } from "../../src/project/registry-generator";
import { verifyUIProject } from "../../src/verify-ui";
import { createSourceRootProjectFixture } from "../support/source-root-project-fixture";

const projects: string[] = [];
afterEach(async () => {
  await Promise.all(projects.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture(entryEol = "\n", generatedEol = "\n") {
  const result = await createSourceRootProjectFixture();
  projects.push(result.projectRoot);
  // This local-only fixture has no official Plugins. Give discovery an explicit
  // empty installed catalog so unrelated official service contracts stay out.
  const packageRoot = path.join(result.projectRoot, "node_modules", "@za38.03", "agent-ui-plugins");
  await mkdir(path.join(packageRoot, "dist"), { recursive: true });
  const identity = { name: "@za38.03/agent-ui-plugins", version: "0.0.0" };
  await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({
    ...identity, exports: { "./catalog.json": "./dist/catalog.json" },
  }));
  await writeFile(path.join(packageRoot, "dist", "catalog.json"), JSON.stringify({
    schemaVersion: 1, package: identity, plugins: [],
  }));
  await writeFile(result.paths.pluginRegistryEntryPath, PLUGIN_REGISTRY_ENTRY_SOURCE.replaceAll("\n", entryEol));
  await writeGeneratedPluginRegistry(result.projectRoot, { initializeApplications: false });
  const generated = await readFile(result.paths.generatedPluginRegistryPath, "utf8");
  await writeFile(result.paths.generatedPluginRegistryPath, generated.replaceAll("\n", generatedEol));
  return result;
}

async function checkFreshness(root: string, fresh: boolean, warningCode?: string, errorCode?: string) {
  const verification = await verifyUIProject(root);
  expect(verification.capabilityCatalog.generatedFileFresh).toBe(fresh);
  expect(verification.status).toBe(fresh ? "passed" : "failed");
  expect(verification.errors.filter(issue => issue.code.startsWith("plugin-registry-")))
    .toEqual(errorCode ? [expect.objectContaining({ code: errorCode })] : []);
  expect((await inspectUIProject(root)).capabilityCatalog.generatedFileFresh).toBe(fresh);
  const creator = await inspectCreatorProject(root);
  expect(creator.status, JSON.stringify(creator)).toBe("ready");
  if (creator.status !== "ready") throw new Error("Expected a ready fixture");
  const codes = creator.warnings?.map(issue => issue.code) ?? [];
  expect(codes).toEqual(warningCode ? [warningCode] : []);
}

describe("registry line endings across verification, inspection and generation", () => {
  it.each([
    ["LF", "\n", "\n"],
    ["CRLF entry", "\r\n", "\n"],
    ["CRLF generated", "\n", "\r\n"],
    ["CRLF both", "\r\n", "\r\n"],
  ])("accepts %s without rewriting files", async (_label, entryEol, generatedEol) => {
    const { projectRoot, paths } = await fixture(entryEol, generatedEol);
    const entryBefore = await readFile(paths.pluginRegistryEntryPath, "utf8");
    const generatedBefore = await readFile(paths.generatedPluginRegistryPath, "utf8");
    await checkFreshness(projectRoot, true);
    expect(await writeGeneratedPluginRegistry(projectRoot, { initializeApplications: false })).toMatchObject({ changed: false });
    expect(await readFile(paths.pluginRegistryEntryPath, "utf8")).toBe(entryBefore);
    expect(await readFile(paths.generatedPluginRegistryPath, "utf8")).toBe(generatedBefore);
  });

  it.each(["entry", "generated"] as const)("rejects real %s edits even with CRLF", async target => {
    const { projectRoot, paths } = await fixture("\r\n", "\r\n");
    const file = target === "entry" ? paths.pluginRegistryEntryPath : paths.generatedPluginRegistryPath;
    // Even trailing whitespace is a content difference, not an EOL conversion.
    const changed = `${await readFile(file, "utf8")} \r\n`;
    await writeFile(file, changed);
    await checkFreshness(projectRoot, false,
      target === "entry" ? "AGENT_UI_REGISTRY_ENTRY_STALE" : "AGENT_UI_GENERATED_REGISTRY_STALE",
      target === "entry" ? "plugin-registry-entry" : "plugin-registry-generated-stale");
    expect(await readFile(file, "utf8")).toBe(changed);
    if (target === "generated") {
      expect(await writeGeneratedPluginRegistry(projectRoot, { initializeApplications: false })).toMatchObject({ changed: true });
      await checkFreshness(projectRoot, true);
    }
  });

  it.each(["entry", "generated"] as const)("rejects a missing %s file", async target => {
    const { projectRoot, paths } = await fixture();
    await rm(target === "entry" ? paths.pluginRegistryEntryPath : paths.generatedPluginRegistryPath);
    await checkFreshness(projectRoot, false,
      target === "entry" ? "AGENT_UI_REGISTRY_ENTRY_STALE" : "AGENT_UI_GENERATED_REGISTRY_STALE",
      target === "entry" ? "plugin-registry-entry" : "plugin-registry-generated-missing");
  });
});
