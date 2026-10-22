import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { spawnPnpm } from "./pnpm-process.mjs";
import { publicModules, publicPackageName } from "./build-public-packages.mjs";
import { sidecarRoot, verifySidecarPackage } from "../packages/creator/scripts/verify-sidecar-package.mjs";
import { startCreatorArtifactRegistry } from "./creator-artifact-registry.mjs";

const { values } = parseArgs({ options: { "skip-build": { type: "boolean" }, npm: { type: "boolean" } } });
const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), "creator npm demo 中文 "));
let child;
let artifactRegistry;
const stopped = () => child ? new Promise((resolve, reject) => {
  if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
  const timer = setTimeout(() => { child.kill(); reject(new Error("CLI shutdown timed out")); }, 10_000);
  child.once("exit", () => { clearTimeout(timer); resolve(); });
  if (child.connected) child.disconnect();
  else child.kill();
}) : Promise.resolve();
async function pnpm(args, cwd, env = process.env) {
  const result = spawnPnpm(args, { cwd, env });
  let output = "";
  result.stdout.on("data", chunk => { output += chunk; });
  result.stderr.on("data", chunk => { output += chunk; });
  await new Promise((resolve, reject) => {
    result.once("error", reject);
    result.once("exit", code => code === 0 ? resolve() : reject(new Error(output)));
  });
}
async function node(args, cwd, env) {
  const result = spawn(process.execPath, args, { cwd, env, stdio: "inherit" });
  await new Promise((resolve, reject) => {
    result.once("error", reject);
    result.once("close", code => code === 0 ? resolve() : reject(new Error(`Node verification process exited ${code}`)));
  });
}
async function npmEntry() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
  ];
  for (const candidate of candidates) {
    if (!candidate || path.basename(candidate) !== "npm-cli.js") continue;
    try { await access(candidate); return candidate; } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  throw new Error("npm-cli.js must be installed alongside Node to run --npm verification");
}
function cleanEnvironment(searchPath) {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (/^(?:path$|python|pip_|uv_|virtual_env$|conda_|creator_|agent_ui_|node_path$|node_options$)/iu.test(name)) delete environment[name];
  }
  return { ...environment, PATH: searchPath, PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1" };
}
try {
  if (!values["skip-build"]) {
    await pnpm(["run", "build:package"], root);
  }
  const archivesRoot = path.join(temporary, "packages");
  const consumer = path.join(temporary, "consumer");
  const project = path.join(temporary, "frontend");
  const emptyPath = path.join(temporary, "empty-path");
  await Promise.all([mkdir(archivesRoot), mkdir(consumer), mkdir(emptyPath), mkdir(path.join(project, "src"), { recursive: true })]);
  const runtimeEnvironment = { ...cleanEnvironment(emptyPath), CREATOR_PYTHON_ENV_ROOT: path.join(temporary, "must-not-bootstrap-python") };
  const overrides = {};
  console.log("[Creator demo] Packing the public npm package...");
  for (const directory of await readdir(path.join(root, "packages"))) {
    const packageRoot = path.join(root, "packages", directory);
    let manifest;
    try { manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8")); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (manifest.private) continue;
    const previous = new Set(await readdir(archivesRoot));
    await pnpm(["pack", "--pack-destination", archivesRoot], packageRoot, { ...process.env, npm_config_ignore_scripts: "true" });
    const archive = (await readdir(archivesRoot)).find(file => !previous.has(file) && file.endsWith(".tgz"));
    assert(archive, manifest.name);
    overrides[manifest.name] = `file:../packages/${archive}`;
  }
  assert.deepEqual(Object.keys(overrides).sort(), publicModules.map(publicPackageName).sort());
  const platformRoot = sidecarRoot(`${process.platform}-${process.arch}`);
  const sidecar = await verifySidecarPackage(platformRoot);
  const previous = new Set(await readdir(archivesRoot));
  await pnpm(["pack", "--pack-destination", archivesRoot], platformRoot, { ...process.env, npm_config_ignore_scripts: "true" });
  const sidecarArchive = (await readdir(archivesRoot)).find(file => !previous.has(file) && file.endsWith(".tgz"));
  assert(sidecarArchive);
  overrides[sidecar.name] = `file:../packages/${sidecarArchive}`;
  assert(overrides["@za38.03/agent-ui-creator"]);
  artifactRegistry = await startCreatorArtifactRegistry(archivesRoot);
  const creatorManifest = JSON.parse(await readFile(path.join(root, "packages/creator/package.json"), "utf8"));
  // Install only Creator through ordinary registry metadata. Its peers and platform
  // dependency must be selected by the package manager, without manual installation.
  await writeFile(path.join(consumer, "package.json"), JSON.stringify({
    name: "creator-npm-consumer", private: true,
    devDependencies: { "@za38.03/agent-ui-creator": creatorManifest.version },
  }, null, 2));
  await writeFile(path.join(consumer, "pnpm-workspace.yaml"), "packages: []\n");
  await writeFile(path.join(consumer, ".npmrc"), `@za38.03:registry=${artifactRegistry.origin}\n`);
  await writeFile(path.join(project, "package.json"), JSON.stringify({ name: "plain-frontend", private: true }));
  console.log("[Creator demo] Installing Creator into an isolated consumer...");
  if (values.npm) {
    // A fresh cache and Node-only PATH exercise ordinary npm installation without
    // the workspace store, system Python, pip, package overrides or manual peers.
    const nodeOnly = path.join(temporary, "node-only");
    await mkdir(nodeOnly);
    await copyFile(process.execPath, path.join(nodeOnly, path.basename(process.execPath)));
    await node([await npmEntry(), "install", "--cache", path.join(temporary, "npm-cache"), "--fetch-retries=0", "--fetch-timeout=30000", "--no-audit", "--no-fund"], consumer, cleanEnvironment(nodeOnly));
    const lock = JSON.parse(await readFile(path.join(consumer, "package-lock.json"), "utf8"));
    assert.deepEqual(lock.packages[""].devDependencies, { "@za38.03/agent-ui-creator": creatorManifest.version });
    for (const entry of Object.values(lock.packages)) assert(!entry.link && !entry.resolved?.startsWith("file:"), "Consumer must install real npm artifacts, never workspace links");
  } else {
    await pnpm(["install", "--ignore-scripts", "--prefer-offline", "--fetch-retries=0", "--fetch-timeout=15000"], consumer);
  }
  const installed = await realpath(path.join(consumer, "node_modules/@za38.03/agent-ui-creator"));
  assert(!installed.startsWith(root), "Installation must not resolve to workspace links");
  const installedCreator = installed;
  const installedOperator = path.dirname(createRequire(path.join(installedCreator, "package.json")).resolve("@za38.03/agent-ui-operator/package.json"));
  assert(path.relative(consumer, await realpath(installedOperator)).startsWith(`node_modules${path.sep}`), "Operator must be installed automatically inside the consumer");
  await access(path.join(installedOperator, "dist/browser/index.html"));
  await access(path.join(installedCreator, "dist/python-sidecar.json"));
  const installedRequire = createRequire(path.join(consumer, "package.json"));
  const creatorRequire = createRequire(path.join(installedCreator, "package.json"));
  await verifySidecarPackage(path.dirname(creatorRequire.resolve(`${sidecar.name}/package.json`)));
  assert.equal(typeof installedRequire("@za38.03/agent-ui-creator/dock/webpack").createCreatorDockWebpackPlugin, "function");
  console.log("[Creator demo] Starting the installed CLI and checking the GUI APIs...");
  child = spawn(process.execPath, [path.join(installedCreator, "dist/cli.js")], {
    cwd: consumer, env: { ...runtimeEnvironment, CREATOR_PORT: "0", CREATOR_OPEN_BROWSER: "0" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const endpoint = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`CLI startup timed out: ${output}`)), 20_000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`CLI exited ${code}: ${output}`)); });
    const read = chunk => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
  });
  const html = await (await fetch(endpoint)).text();
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1]);
  assert(assets.length >= 2, "Browser HTML must reference built JavaScript and CSS");
  for (const asset of assets) assert.equal((await fetch(new URL(asset, endpoint))).status, 200);
  const dockHtml = await (await fetch(`${endpoint}dock.html`)).text();
  for (const match of dockHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) assert.equal((await fetch(new URL(match[1], endpoint))).status, 200);
  const dockClient = await fetch(`${endpoint}dock-client.js`);
  assert.equal(dockClient.status, 200);
  assert.match(await dockClient.text(), /agent-ui-creator-dock/);
  const api = `${endpoint}__agent-ui/creator/workspace`;
  assert.equal((await (await fetch(api)).json()).status, "none");
  const selected = await fetch(`${api}/select`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectRoot: project }) });
  assert.equal(selected.status, 200);
  assert.equal((await selected.json()).status, "uninitialized");
  const setup = await (await fetch(`${api}/setup`)).json();
  assert.equal(setup.suggestedSourceRoot, "src/agent-ui");
  assert.equal(setup.modes.length, 3);
  const smokeFile = path.join(consumer, "runtime-smoke.mjs");
  await copyFile(path.join(root, "scripts/creator-installed-runtime-smoke.mjs"), smokeFile);
  await node([smokeFile, installedCreator, project], consumer, runtimeEnvironment);
  await assert.rejects(access(runtimeEnvironment.CREATOR_PYTHON_ENV_ROOT), { code: "ENOENT" });
  await stopped();
  assert.equal(child.exitCode, 0);
  await assert.rejects(fetch(endpoint));
  console.log(`Installing only Creator (${values.npm ? "npm with a fresh cache" : "pnpm"}): automatic Operator/platform dependencies, empty-PATH CLI/Python startup, restart, GUI assets, project setup and clean shutdown passed outside the workspace.`);
} finally {
  await stopped();
  await artifactRegistry?.close();
  await rm(temporary, { recursive: true, force: true });
}
