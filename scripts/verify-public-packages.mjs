import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { spawnPnpmSync } from "./pnpm-process.mjs";
import { publicModules, publicPackageName } from "./build-public-packages.mjs";
import { assertContractParity } from "../packages/creator/scripts/contract-integrity.mjs";
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
 await assertContractParity(path.join(root, "contracts/creator"), path.join(consumer, "node_modules/@za38.03/agent-ui-creator/dist/python/agent_ui_creator/_contracts/creator"));
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
import { createDefaultAgentUIPresetRegistry, initializeAgentUIProject } from "@za38.03/agent-ui-operator/bootstrap";
import { handleUIOperatorRequest } from "@za38.03/agent-ui-operator/dev";
import { loadAgentUISourceRegistry } from "@za38.03/agent-ui-source-registry";
import composer from "@za38.03/agent-ui-plugins/assistant-ui-composer";
void [createAgentUIGenerativeUI, Button, DemoAttachmentAdapter, LayoutRenderer, useConversationRuntimeBridge, createPythonCreatorClient, createMockAgentHttpHandler, createDefaultAgentUIPresetRegistry, initializeAgentUIProject, handleUIOperatorRequest, loadAgentUISourceRegistry, composer];
let theme: AgentUITheme | undefined; void theme;
`);
 await writeFile(path.join(consumer, "smoke.mjs"), `
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadAgentUISourceRegistry, officialPackagePlugin } from "@za38.03/agent-ui-source-registry";
import { initializeAgentUIProject } from "@za38.03/agent-ui-operator/bootstrap";
import { createAgentUIInitializationHost, inspectCreatorProject } from "@za38.03/agent-ui-operator/host";
import { createMockAgentHttpHandler, builtinMockScenarios } from "@za38.03/agent-ui-creator/mock-agent";
const registry = await loadAgentUISourceRegistry();
assert(registry.items.length > 0);
assert(!registry.byId.has("integration/a2ui"));
assert(!("createAgentUIA2ui" in await import("@za38.03/agent-ui-plugins/generative-ui")));
assert(!(await readFile("node_modules/@za38.03/agent-ui-runtime/dist/public.d.ts", "utf8")).includes("useConversationA2uiAction"));
assert(builtinMockScenarios.length > 0);
assert.equal(typeof createMockAgentHttpHandler, "function");
for (const item of registry.items) for (const name of Object.keys(item.packages ?? {})) assert(!name.includes("/bootstrap") && !name.includes("/mock-agent"), name);
assert.equal(officialPackagePlugin("assistant-ui-composer").runtime.package, "@za38.03/agent-ui-plugins");
await initializeAgentUIProject({ projectRoot: process.cwd(), mode: "assistant", sourceRoot: "src/agent-ui" }, createAgentUIInitializationHost());
assert.equal((await inspectCreatorProject(process.cwd())).status, "ready");
`);
 run(["smoke.mjs"]);
 run([path.join(consumer, "node_modules/@za38.03/agent-ui-creator/dist/cli.js"), "--help"]);
 await writeFile(path.join(consumer, "app.tsx"), 'export { Agent } from "./src/agent-ui/application/Agent";\n');
 await writeFile(path.join(consumer, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true, skipLibCheck: !process.argv.includes("--strict-types"), noEmit: true, esModuleInterop: true, resolveJsonModule: true, types: ["node", "react", "vite/client"], lib: ["DOM", "ES2022"] }, include: ["consumer.tsx", "app.tsx", "src"] }));
 run([path.join(consumer, "node_modules/typescript/bin/tsc"), "--noEmit"]);
 // Deployment consumer physically excludes every development package and control entry.
 for (const name of ["creator", "operator", "source-registry"]) {
  await rm(path.join(consumer, "node_modules", manifests[name].name), { recursive: true });
 }
 await rm(path.join(consumer, ".agent-ui"), { recursive: true, force: true });
 const frontendModules = publicModules.filter(name => !["creator", "operator", "source-registry"].includes(name));
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
assert(![...inputs].some(file => ["creator", "operator", "source-registry"].some(name => file.replaceAll(String.fromCharCode(92), "/").includes("/agent-ui-" + name + "/"))), "Production imported development packages");
console.log("Production module graph excludes Creator, Operator and Source Registry.");
`);
 run(["bundle.mjs"]);
 console.log("8 independent tarballs: exact dependency versions, merged subpaths, Registry, initialization, consumer types and independent production build passed.");
} finally { await rm(consumer, { recursive: true, force: true }); }
