import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { spawnPnpmSync } from "./pnpm-process.mjs";
import { publicModules, publicPackageName } from "./build-public-packages.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const consumer = await realpath(await mkdtemp(path.join(tmpdir(), "agent-ui independent packages 中文 ")));
const manifests = {};
function run(args) {
 const result = spawnSync(process.execPath, args, { cwd: consumer, encoding: "utf8", timeout: 120000, maxBuffer: 20 * 1024 * 1024 });
 assert.equal(result.status, 0, `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`);
}
try {
 const thirdParty = new Map();
 for (const name of publicModules) {
  const source = path.join(root, "packages", name);
  const manifest = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
  manifests[name] = manifest;
  const archives = path.join(consumer, "archives", name);
  await mkdir(archives, { recursive: true });
  const packed = spawnPnpmSync(["pack", "--pack-destination", archives], { cwd: source, encoding: "utf8", env: { ...process.env, npm_config_ignore_scripts: "true" } });
  assert.equal(packed.status, 0, packed.stderr);
  const [filename] = (await readdir(archives)).filter(file => file.endsWith(".tgz"));
  assert(filename);
  const archive = path.join(archives, filename);
  const packageRoot = path.join(consumer, "node_modules", manifest.name);
  await mkdir(packageRoot, { recursive: true });
    const tar = gunzipSync(await readFile(archive));
    let longPath;
    for (let offset = 0; offset + 512 <= tar.length;) {
      const header = tar.subarray(offset, offset + 512);
      if (header.every(byte => byte === 0)) break;
      const string = (start, end) => header.subarray(start, end).toString().split("\0")[0];
      const size = parseInt(string(124, 136).trim(), 8) || 0;
      const prefix = string(345, 500);
      const name = longPath ?? [prefix, string(0, 100)].filter(Boolean).join("/");
      const type = string(156, 157);
      const data = tar.subarray(offset + 512, offset + 512 + size);
      offset += 512 + Math.ceil(size / 512) * 512;
      if (type === "x") {
        longPath = data.toString().match(/(?:^|\n)\d+ path=([^\n]+)/u)?.[1];
        continue;
      }
      if (type === "L") { longPath = data.toString().replace(/\0.*$/su, ""); continue; }
      longPath = undefined;
      if (type === "5") continue;
      assert(type === "0" || type === "", `Unexpected archive entry: ${type} ${name}`);
      assert(name.startsWith("package/") && !name.split("/").includes(".."), name);
      assert(!/(?:^|\/)(?:[^/]*a2ui[^/]*|experimental)(?:\/|$)/iu.test(name), `Deferred A2UI artifact leaked: ${manifest.name}: ${name}`);
      const file = path.join(packageRoot, ...name.slice("package/".length).split("/"));
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, data);
    }

  const published = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  assert.equal(published.name, manifest.name);
  for (const [dependency, version] of Object.entries(published.dependencies ?? {})) {
    assert(!version.startsWith("workspace:"));
    if (dependency.startsWith("@za38.03/agent-ui-")) {
      const owner = publicModules.find(name => publicPackageName(name) === dependency);
      assert(owner, `Unknown first-party dependency: ${dependency}`);
      const dependencyManifest = JSON.parse(await readFile(path.join(root, "packages", owner, "package.json"), "utf8"));
      assert.equal(version, dependencyManifest.version);
    }
  }
  for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies })) {
    if (dependency.startsWith("@za38.03/agent-ui-")) continue;
    const candidate = path.join(source, "node_modules", dependency);
    try { await realpath(candidate); thirdParty.set(dependency, candidate); } catch { }
  }
 }
 for (const [name, source] of thirdParty) {
  const link = path.join(consumer, "node_modules", name);
  await mkdir(path.dirname(link), { recursive: true });
  await symlink(source, link, "junction");
 }
 await readFile(path.join(consumer, "node_modules/@za38.03/agent-ui-creator/skills/ui-debugging/references/runtime-debugging.md"));
 await readFile(path.join(consumer, "node_modules/@za38.03/agent-ui-creator/dist/python-sidecar.json"));
 await writeFile(path.join(consumer, "package.json"), JSON.stringify({ name: "independent-public-consumer", private: true, type: "module", dependencies: Object.fromEntries(publicModules.map(name => [manifests[name].name, manifests[name].version])) }));
 await mkdir(path.join(consumer, "src"));
 await writeFile(path.join(consumer, "consumer.tsx"), `
import { Button, type AgentUITheme } from "@za38.03/agent-ui-plugins";
import { DemoAttachmentAdapter } from "@za38.03/agent-ui-plugins/demo-attachments";
import { createAgentUIGenerativeUI } from "@za38.03/agent-ui-plugins/generative-ui";
import { LayoutRenderer } from "@za38.03/agent-ui-renderer";
import { useConversationRuntimeBridge } from "@za38.03/agent-ui-runtime";
import { createPythonCreatorClient } from "@za38.03/agent-ui-creator";
import { createMockAgentHttpHandler } from "@za38.03/agent-ui-creator/mock-agent";
import { createDefaultAgentUIPresetRegistry, initializeAgentUIProject } from "@za38.03/agent-ui-creator/bootstrap";
import { handleUIOperatorRequest } from "@za38.03/agent-ui-creator/operator/dev";
import { loadAgentUISourceRegistry } from "@za38.03/agent-ui-creator/source-registry";
import composer from "@za38.03/agent-ui-plugins/composer";
import { formTools } from "@za38.03/agent-ui-plugins/form-tools";
void [createAgentUIGenerativeUI, Button, DemoAttachmentAdapter, LayoutRenderer, useConversationRuntimeBridge, createPythonCreatorClient, createMockAgentHttpHandler, createDefaultAgentUIPresetRegistry, initializeAgentUIProject, handleUIOperatorRequest, loadAgentUISourceRegistry, composer, formTools];
let theme: AgentUITheme | undefined; void theme;
`);
 await writeFile(path.join(consumer, "smoke.mjs"), `
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { loadAgentUISourceRegistry, officialPackagePlugin } from "@za38.03/agent-ui-creator/source-registry";
import { initializeAgentUIProject } from "@za38.03/agent-ui-creator/bootstrap";
import { createAgentUIInitializationHost, inspectCreatorProject } from "@za38.03/agent-ui-creator/operator/host";
import { createMockAgentHttpHandler, builtinMockScenarios } from "@za38.03/agent-ui-creator/mock-agent";
const registry = await loadAgentUISourceRegistry();
assert(registry.items.length > 0);
assert(!registry.byId.has("integration/a2ui"));
assert(!("createAgentUIA2ui" in await import("@za38.03/agent-ui-plugins/generative-ui")));
assert(!(await readFile("node_modules/@za38.03/agent-ui-runtime/dist/public.d.ts", "utf8")).includes("useConversationA2uiAction"));
assert(builtinMockScenarios.length > 0);
assert.equal(typeof createMockAgentHttpHandler, "function");
for (const item of registry.items) for (const name of Object.keys(item.packages ?? {})) assert(!name.includes("/bootstrap") && !name.includes("/mock-agent"), name);
assert.equal(officialPackagePlugin("composer").runtime.package, "@za38.03/agent-ui-plugins");
await initializeAgentUIProject({ projectRoot: process.cwd(), mode: "assistant", sourceRoot: "src/agent-ui" }, createAgentUIInitializationHost());
assert.equal((await inspectCreatorProject(process.cwd())).status, "ready");
const { ensureManagedOperator } = await import("@za38.03/agent-ui-creator/operator");
await ensureManagedOperator(process.cwd());
const { spawnSync } = await import("node:child_process");
const operation = spawnSync(process.execPath, [".agent-ui/operator/entry.mjs"], {
  cwd: process.cwd(), encoding: "utf8",
  input: JSON.stringify({ operation: "inspect_ui_project", input: {} }),
});
assert.equal(operation.status, 0, operation.stderr);
assert.equal(JSON.parse(operation.stdout).ok, true, operation.stdout);

async function assertProductSource(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    assert(!/assistant[ _-]?ui/i.test(entry.name), file);
    if (entry.isDirectory()) await assertProductSource(file);
    else assert(!/assistant[ _-]?ui/i.test(await readFile(file, "utf8")), file);
  }
}
await assertProductSource("src/agent-ui");
assert(!(await readFile(".agent-ui/source-lock.json", "utf8")).includes("assistant-ui"));
`);
 run(["smoke.mjs"]);
 // Product facades must work without downstream installs of upstream adapters.
 for (const name of ["@assistant-ui/react-lexical", "@assistant-ui/react-hook-form"]) {
  await rm(path.join(consumer, "node_modules", name), { recursive: true, force: true });
 }
 run([path.join(consumer, "node_modules/@za38.03/agent-ui-creator/dist/cli.js"), "--help"]);
 await writeFile(path.join(consumer, "app.tsx"), 'export { Agent } from "./src/agent-ui/application/Agent";\nexport { formTools } from "@za38.03/agent-ui-plugins/form-tools";\n');
 await writeFile(path.join(consumer, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true, skipLibCheck: !process.argv.includes("--strict-types"), noEmit: true, esModuleInterop: true, resolveJsonModule: true, types: ["node", "react", "vite/client"], lib: ["DOM", "ES2022"] }, include: ["consumer.tsx", "app.tsx", "src"] }));
 run([path.join(consumer, "node_modules/typescript/bin/tsc"), "--noEmit"]);
 if (process.argv.includes("--takeover")) {
  // Exercise the public packaged Operator against the independently unpacked
  // target package, then ship the resulting frontend with no development tools.
  const hostPackagePath = path.join(consumer, "package.json");
  const hostPackage = JSON.parse(await readFile(hostPackagePath, "utf8"));
  hostPackage.scripts = { typecheck: "node node_modules/typescript/bin/tsc --noEmit", build: "node validate-takeover.mjs" };
  await writeFile(hostPackagePath, JSON.stringify(hostPackage));
  await writeFile(path.join(consumer, "validate-takeover.mjs"), `
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
await build({ configFile: false, logLevel: "error", plugins: [react(), tailwind()], resolve: { dedupe: ["react", "react-dom"] }, build: { write: false, lib: { entry: "app.tsx", formats: ["es"] } } });
`);
  await writeFile(path.join(consumer, "takeover-check.mjs"), `
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { handleUIOperatorRequest } from "@za38.03/agent-ui-creator/operator/dev";
const request = async (operation, input) => {
 const result = await handleUIOperatorRequest({ operation, input }, process.cwd());
 assert(result.ok, JSON.stringify(result)); return result.result;
};
const modelBefore = await readFile("src/agent-ui/app-ui/app-ui.json");
const plan = await request("plan_plugin_source_takeover", { pluginId: "composer" });
const installed = JSON.parse(await readFile("node_modules/@za38.03/agent-ui-plugins/package.json", "utf8"));
assert.equal(plan.package.version, installed.version);
await request("takeover_plugin_source", { pluginId: "composer", planHash: plan.planHash });
assert((await readFile("src/agent-ui/app-ui/app-ui.json")).equals(modelBefore));
const inspected = await request("inspect_ui_plugin", { pluginId: "composer" });
assert.equal(inspected.asset.ownership, "project_source");
assert(inspected.files.some(file => file.path === "src/agent-ui/plugins/composer/adapters"));
assert(!inspected.files.some(file => file.path.startsWith("source-registry/")));

const sourcePath = "src/agent-ui/plugins/composer/adapters/composer.tsx";
await writeFile(sourcePath, (await readFile(sourcePath, "utf8")) + "\\n// Project customization preserved across npm replacement.\\n");
const customized = await readFile(sourcePath);
const ownership = await readFile(".agent-ui/plugin-ownership.json");
// Replace installed npm assets with a synthetic newer release. Its packaged
// Composer deliberately cannot run, proving the local registry stays selected.
installed.version = "99.0.0";
await writeFile("node_modules/@za38.03/agent-ui-plugins/package.json", JSON.stringify(installed));
const catalogPath = "node_modules/@za38.03/agent-ui-plugins/dist/catalog.json";
const catalog = JSON.parse(await readFile(catalogPath, "utf8")); catalog.package.version = "99.0.0";
catalog.plugins.find(plugin => plugin.id === "composer").version = "99.0.0";
await writeFile(catalogPath, JSON.stringify(catalog));
await writeFile("node_modules/@za38.03/agent-ui-plugins/dist/composer/index.js", 'throw new Error("New package Composer must not replace local source");');
await request("migrate_official_package_plugin", { pluginId: "composer" });
await request("synchronize_plugin_registry", { expectedSourceHash: createHash("sha256").update(await readFile("src/agent-ui/plugins/registry.generated.ts")).digest("hex") });
assert((await readFile(sourcePath)).equals(customized));
assert((await readFile(".agent-ui/plugin-ownership.json")).equals(ownership));
assert((await readFile("src/agent-ui/plugins/registry.generated.ts", "utf8")).includes("./composer/definition"));
console.log("Packaged takeover: exact installed source, Host typecheck/build, stable model and source preserved after synthetic npm upgrade.");
`);
  run(["takeover-check.mjs"]);
 }
 // Deployment consumer physically excludes every development package and control entry.
 for (const name of ["creator", "operator"]) {
  await rm(path.join(consumer, "node_modules", manifests[name].name), { recursive: true });
 }
 await rm(path.join(consumer, ".agent-ui"), { recursive: true, force: true });
 const frontendModules = publicModules.filter(name => !["creator", "operator"].includes(name));
 await writeFile(path.join(consumer, "package.json"), JSON.stringify({ name: "independent-frontend-consumer", private: true, type: "module", dependencies: Object.fromEntries(frontendModules.map(name => [manifests[name].name, manifests[name].version])) }));
 const configFile = path.join(consumer, "tsconfig.json");
 const config = JSON.parse(await readFile(configFile, "utf8"));
 config.include = ["app.tsx", "src"];
 await writeFile(configFile, JSON.stringify(config));
 run([path.join(consumer, "node_modules/typescript/bin/tsc"), "--noEmit"]);
 await writeFile(path.join(consumer, "bundle.mjs"), `
import assert from "node:assert/strict";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
const inputs = new Set();
await build({ configFile: false, plugins: [react(), tailwind(), { name: "production-boundary", generateBundle(_, bundle) { for (const chunk of Object.values(bundle)) if (chunk.type === "chunk") for (const file of Object.keys(chunk.modules)) inputs.add(file); } }], resolve: { dedupe: ["react", "react-dom"] }, build: { lib: { entry: "app.tsx", formats: ["es"], fileName: () => "app.js" } } });
assert(![...inputs].some(file => file.replaceAll(String.fromCharCode(92), "/").includes("/dist/catalog/") || file.replaceAll(String.fromCharCode(92), "/").includes("/dist/sources/")), "Production imported source tooling assets");
assert(![...inputs].some(file => ["creator", "operator"].some(name => file.replaceAll(String.fromCharCode(92), "/").includes("/agent-ui-" + name + "/"))), "Production imported development packages");
if (${process.argv.includes("--takeover")}) {
 const normalized = [...inputs].map(file => file.replaceAll(String.fromCharCode(92), "/"));
 assert(normalized.some(file => file.includes("/src/agent-ui/plugins/composer/adapters/composer.tsx")), "Production must include local Composer");
 assert(!normalized.some(file => file.includes("/agent-ui-plugins/dist/composer/index.js")), "Production must not select npm Composer");
 assert.equal(normalized.filter(file => file.endsWith("/internal/composer-input-host-context.js")).length, 1, "Exactly one shared Composer context module");
}
console.log("Production module graph excludes development tooling.");
`);
 run(["bundle.mjs"]);
 console.log("7 independent tarballs: exact dependencies, compatibility subpaths, Registry, initialization, consumer types and production without Creator/Operator passed.");
} finally { await rm(consumer, { recursive: true, force: true }); }
