import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript-ui-audit";
import { ensureExampleHost, exampleHosts } from "./prepare-example-host.mjs";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));

function registryManifests(source) {
  const file = ts.createSourceFile("registry.generated.ts", source, ts.ScriptTarget.Latest, true);
  const manifests = new Map();
  function literal(node) {
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
    assert(ts.isObjectLiteralExpression(node), `Expected a literal manifest: ${node.getText(file)}`);
    return Object.fromEntries(node.properties.map(property => {
      assert(ts.isPropertyAssignment(property));
      assert(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name));
      return [property.name.text, literal(property.initializer)];
    }));
  }
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(file) === "manifest") {
      const manifest = literal(node.initializer);
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
  test(`${mode} foundation, Shell and source lock match the current Bootstrap templates`, async () => {
    const project = path.join(workspaceRoot, "examples", exampleHosts[mode].directory);
    const sourceRoot = path.join(project, "src", "agent-ui");
    const metadata = JSON.parse(await readFile(path.join(project, ".agent-ui", "project.json"), "utf8"));
    assert.deepEqual(metadata, { sourceRoot: "src/agent-ui" });
    const lock = JSON.parse(await readFile(path.join(project, ".agent-ui", "source-lock.json"), "utf8"));
    assert.equal(lock.sourceRoot, metadata.sourceRoot);
    const expectedItems = ["foundation/core", "foundation/core-adapters", "foundation/core-application", `foundation/shell-${mode}`];
    assert.deepEqual(Object.keys(lock.items).sort(), expectedItems.sort());
    for (const id of expectedItems) {
      const owner = path.join(workspaceRoot, "packages", "plugins", "resources", "registry", "items", ...id.split("/"));
      const item = JSON.parse(await readFile(path.join(owner, "item.json"), "utf8"));
      assert.deepEqual(Object.keys(lock.items[id].files).sort(), item.files.map(file => file.target).sort());
      for (const file of item.files) {
        const canonical = await readFile(path.join(owner, ...file.source.split("/")));
        const actual = await readFile(path.join(sourceRoot, ...file.target.split("/")));
        assert.deepEqual(actual, canonical, `${mode}/${file.target}: synchronize from the canonical template`);
        assert.equal(lock.items[id].files[file.target].sha256, createHash("sha256").update(actual).digest("hex"));
      }
    }
    const entries = await readdir(sourceRoot);
    for (const legacy of ["runtime", "framework", "agent-ui", "app-ui"]) {
      assert(!entries.includes(legacy), `${mode}: obsolete generated directory ${legacy}`);
    }
    assert.deepEqual((await readdir(path.join(sourceRoot, "application"))).sort(), ["Agent.tsx", "locales.ts", "project-config.tsx", "runtime-config.generated.ts", "shell"]);
    const presetRoot = path.join(workspaceRoot, "packages", "creator", "operator", "presets", mode);
    let preset = JSON.parse(await readFile(path.join(presetRoot, "app-ui.json"), "utf8"));
    if (preset.$ref) preset = JSON.parse(await readFile(path.resolve(presetRoot, preset.$ref), "utf8"));
    assert.deepEqual(JSON.parse(await readFile(path.join(sourceRoot, "app-ui.json"), "utf8")), preset);
  });
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
