import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnPnpm } from "./pnpm-process.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), "creator npm demo 中文 "));
let child;
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
try {
  if (!process.argv.includes("--skip-build")) {
    await pnpm(["run", "build:package"], root);
  }
  const archivesRoot = path.join(temporary, "packages");
  const consumer = path.join(temporary, "consumer");
  const project = path.join(temporary, "frontend");
  await Promise.all([mkdir(archivesRoot), mkdir(consumer), mkdir(path.join(project, "src"), { recursive: true })]);
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
  assert.equal(Object.keys(overrides).length, 9);
  assert(overrides["@za38.03/agent-ui-creator"]);
  // Local tarballs substitute only their independently installable package names.
  await writeFile(path.join(consumer, "package.json"), JSON.stringify({
    name: "creator-npm-consumer", private: true,
    devDependencies: { "@za38.03/agent-ui-creator": overrides["@za38.03/agent-ui-creator"] },
    pnpm: { overrides },
  }, null, 2));
  await writeFile(path.join(consumer, "pnpm-workspace.yaml"), `packages: []
overrides:
${Object.entries(overrides).map(([name, value]) => `  ${JSON.stringify(name)}: ${JSON.stringify(value)}`).join("\n")}
`);
  await writeFile(path.join(project, "package.json"), JSON.stringify({ name: "plain-frontend", private: true }));
  console.log("[Creator demo] Installing Creator into an isolated consumer...");
  await pnpm(["install", "--ignore-scripts", "--prefer-offline", "--fetch-retries=0", "--fetch-timeout=15000", ...(process.argv.includes("--offline") ? ["--offline"] : [])], consumer);
  const installed = await realpath(path.join(consumer, "node_modules/@za38.03/agent-ui-creator"));
  assert(!installed.startsWith(root), "Installation must not resolve to workspace links");
  const installedCreator = installed;
  await access(path.join(installedCreator, "dist/browser/index.html"));
  await access(path.join(installedCreator, "dist/python/requirements.lock"));
  const installedRequire = createRequire(path.join(consumer, "package.json"));
  assert.equal(typeof installedRequire("@za38.03/agent-ui-creator/dock/webpack").createCreatorDockWebpackPlugin, "function");
  console.log("[Creator demo] Starting the installed CLI and checking the GUI APIs...");
  child = spawn(process.execPath, [path.join(installedCreator, "dist/cli.js")], {
    cwd: consumer, env: { ...process.env, CREATOR_PORT: "0", CREATOR_OPEN_BROWSER: "0" },
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
  await stopped();
  assert.equal(child.exitCode, 0);
  await assert.rejects(fetch(endpoint));
  console.log("Installed Creator tarball: GUI assets, project selection, initialization setup and CLI shutdown passed outside the workspace.");
} finally {
  await stopped();
  await rm(temporary, { recursive: true, force: true });
}
