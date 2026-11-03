import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript-ui-audit";
import { ensureExampleHost, exampleHosts } from "./prepare-example-host.mjs";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));

function registryManifests(source) {
  const file = ts.createSourceFile("registry.generated.ts", source, ts.ScriptTarget.Latest, true);
  const manifests = new Map();
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(file) === "manifest") {
      const manifest = JSON.parse(node.initializer.getText(file));
      assert(!manifests.has(manifest.id), `Duplicate generated manifest: ${manifest.id}`);
      manifests.set(manifest.id, manifest);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return manifests;
}

const ready = mode => ({ status: "ready", projectConfig: { mode, sourceRoot: "src/agent-ui" } });
for (const mode of ["platform", "assistant", "embedded"]) {
  test(`${mode} package applications and generated capabilities match canonical Plugin metadata`, async () => {
    const plugins = path.join(workspaceRoot, "examples", exampleHosts[mode].directory, "src/agent-ui/plugins");
    const manifests = registryManifests(await readFile(path.join(plugins, "registry.generated.ts"), "utf8"));
    for (const entry of await readdir(plugins, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(plugins, entry.name);
      const marker = await readFile(path.join(directory, "application.json"), "utf8").catch(error => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      });
      if (!marker) continue;
      const { pluginId } = JSON.parse(marker);
      const definition = await readFile(path.join(directory, "definition.ts"), "utf8");
      const file = ts.createSourceFile("definition.ts", definition, ts.ScriptTarget.Latest, true);
      if (!file.statements.some(node => ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === `@za38.03/agent-ui-plugins/${pluginId}`)) continue;
      const canonical = JSON.parse(await readFile(path.join(workspaceRoot, "packages/plugins/src/plugins", pluginId, "plugin.json"), "utf8"));
      const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
      assert.deepEqual(manifest, canonical, `${mode}/${pluginId}: review and synchronize the maintained application manifest`);
      if (manifests.has(pluginId)) {
        assert.deepEqual(manifests.get(pluginId), manifest, `${mode}/${pluginId}: regenerate the capability registry`);
      }
    }
  });
  test(`${mode} initializes an absent project using its own preset and verifies the result`, async () => {
    const calls = [];
    let state = { status: "uninitialized" };
    const result = await ensureExampleHost(mode, {
      root: path.resolve("workspace with spaces"),
      inspectProject: async () => state,
      initializeProject: async input => { calls.push(input); state = ready(mode); },
    });
    assert.deepEqual(calls, [{ projectRoot: result.projectRoot, mode, sourceRoot: "src/agent-ui" }]);
  });
  test(`${mode} does not reinitialize a ready project or adopt a new source baseline`, async () => {
    await ensureExampleHost(mode, {
      inspectProject: async () => ready(mode),
      initializeProject: async () => assert.fail("must preserve existing application/source files"),
    });
  });
}
test("broken or mismatched examples stop without resetting or migrating files", async () => {
  for (const state of [{ status: "broken", issues: [{ code: "custom-source-conflict" }] }, ready("assistant")]) {
    await assert.rejects(ensureExampleHost("platform", {
      inspectProject: async () => state,
      initializeProject: async () => assert.fail("must not overwrite an existing project"),
    }), /requires repair/);
  }
});
test("an initialization that does not produce the selected ready project is rejected", async () => {
  await assert.rejects(ensureExampleHost("embedded", {
    inspectProject: async () => ({ status: "uninitialized" }), initializeProject: async () => {},
  }), /requires repair/);
});
test("unknown modes fail before inspection or mutation", async () => {
  await assert.rejects(ensureExampleHost("../../outside", {
    inspectProject: async () => assert.fail("must not inspect"), initializeProject: async () => assert.fail("must not initialize"),
  }), /Unknown example Mode/);
});
