import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, readdir, symlink, cp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { initializeAgentUIProject } from "../packages/creator/operator/dist/bootstrap/index.js";
import { createAgentUIInitializationHost, installOfficialAgentUIResource, AgentUIUpdateService } from "../packages/creator/operator/dist/runtime/operator-runtime.mjs";
import { loadAgentUISourceRegistry, InstalledUpdateSourceProvider, DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT } from "../packages/creator/operator/dist/source-catalog/index.js";

const repo = fileURLToPath(new URL("..", import.meta.url));
const registry = await loadAgentUISourceRegistry();
const baselineVersion = JSON.parse(await readFile(path.join(DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT, "release.json"), "utf8")).releaseVersion;
const base = await mkdtemp(path.join(tmpdir(), "agent-ui upgrades 中文 "));
const dirs = await readdir(path.join(repo, "packages"));
const dependencies = Object.assign({}, ...registry.items.map(item => item.packages));
const links = new Map();
for (const dir of dirs) {
  try {
    const root = path.join(repo, "packages", dir);
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    links.set(pkg.name, root); dependencies[pkg.name] = pkg.version;
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies })) {
      if (links.has(name)) continue;
      const candidate = path.join(root, "node_modules", name);
      try { await stat(candidate); links.set(name, candidate); } catch {}
    }
  } catch {}
}
async function files(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const name = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await files(name)); else output.push(name);
  }
  return output;
}
const vendorFiles = async root => (await files(root)).filter(file => /[\\/]vendors?[\\/]/iu.test(file));
const put = async (root, name, content) => { const target = path.join(root, name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content); };
async function create(mode) {
  const root = path.join(base, mode);
  await mkdir(path.join(root, "src"), { recursive: true });
  await put(root, "package.json", JSON.stringify({ name: "upgrade-consumer", private: true, type: "module", dependencies }));
  for (const [name, source] of links) {
    const link = path.join(root, "node_modules", name); await mkdir(path.dirname(link), { recursive: true }); await symlink(source, link, "junction");
  }
  await initializeAgentUIProject({ projectRoot: root, mode, sourceRoot: "src/agent-ui" }, createAgentUIInitializationHost());
  assert.deepEqual(await vendorFiles(root), []);
  return root;
}
try {
  const root = await create("assistant");
  await create("embedded"); await create("platform");
  await assert.rejects(installOfficialAgentUIResource(root, "a2ui"), error => error.code === "RESOURCE_UNKNOWN");
  assert.deepEqual(await vendorFiles(root), []);
  const lockPath = path.join(root, ".agent-ui/source-lock.json");
  const source = path.join(root, "src/agent-ui");
  console.log("Three real presets remain vendor-free; deferred official A2UI installation is rejected.");

  // Publish-shaped local release: real immutable directories, real project verification,
  // no MockUpdateSourceProvider and no mocked verification/generators.
  const history = path.join(base, "releases");
  await cp(DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT, path.join(history, baselineVersion), { recursive: true });
  const targetRoot = path.join(history, "0.1.1");
  await cp(DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT, targetRoot, { recursive: true });
  const currentLock = JSON.parse(await readFile(lockPath, "utf8"));
  const selected = "conversation-surface";
  const unselected = Object.keys(currentLock.items).find(id => id.startsWith("plugin/") && id !== `plugin/${selected}`);
  assert(unselected);
  const releasePath = path.join(targetRoot, "release.json");
  const release = JSON.parse(await readFile(releasePath, "utf8")); release.releaseVersion = "0.1.1";
  for (const itemId of [`plugin/${selected}`, unselected]) {
    const item = registry.byId.get(itemId); const id = itemId.slice(7);
    const version = release.plugins[id].version.split(".").map(Number); version[2]++; const next = version.join(".");
    release.plugins[id].version = next;
    const manifestFile = item.loadedFiles.find(file => file.target === `plugins/${id}/manifest.json`);
    const directory = path.join(targetRoot, path.relative(DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT, item.itemRoot));
    const manifest = JSON.parse(manifestFile.content); manifest.version = next;
    await writeFile(path.join(directory, manifestFile.source), JSON.stringify(manifest, null, 2));
    const logPath = path.join(directory, "changelog.json"); const log = JSON.parse(await readFile(logPath, "utf8"));
    log[next] = { summary: "Local release validation", changes: ["Validate independent plugin upgrade"] };
    await writeFile(logPath, JSON.stringify(log));
  }
  await writeFile(releasePath, JSON.stringify(release));
  const beforeUnselected = JSON.stringify(currentLock.items[unselected]);
  const unselectedBytes = new Map(await Promise.all(Object.keys(currentLock.items[unselected].files).map(async file => [file, await readFile(path.join(source, file))])));
  const provider = new InstalledUpdateSourceProvider(targetRoot, history);
  const updates = new AgentUIUpdateService(provider);
  assert((await updates.inspect(root)).plugins.filter(plugin => plugin.updateAvailable).length >= 2);
  const plan = await updates.plan(root, [selected], "0.1.1");
  assert.equal(plan.blocked, false, JSON.stringify(plan.issues));
  assert(!plan.items.some(item => item.itemId === unselected));
  assert.equal(plan.items.find(item => item.itemId === `plugin/${selected}`).reason, "requested");
  await updates.execute(root, plan.id);
  const after = JSON.parse(await readFile(lockPath, "utf8"));
  assert.equal(after.items[`plugin/${selected}`].pluginVersion, release.plugins[selected].version);
  assert.equal(JSON.stringify(after.items[unselected]), beforeUnselected);
  for (const [file, bytes] of unselectedBytes) assert.deepEqual(await readFile(path.join(source, file)), bytes);
  const selectedFile = registry.byId.get(`plugin/${selected}`).loadedFiles.find(file => file.target.endsWith("index.tsx"));
  await writeFile(path.join(source, selectedFile.target), Buffer.concat([selectedFile.content, Buffer.from("\n// user customization\n")]));
  const nextRoot = path.join(history, "0.1.2");
  await cp(targetRoot, nextRoot, { recursive: true });
  const nextDescriptor = JSON.parse(await readFile(path.join(nextRoot, "release.json"), "utf8"));
  nextDescriptor.releaseVersion = "0.1.2";
  const components = nextDescriptor.plugins[selected].version.split(".").map(Number); components[2]++;
  nextDescriptor.plugins[selected].version = components.join(".");
  const item = registry.byId.get(`plugin/${selected}`);
  const itemDir = path.join(nextRoot, path.relative(DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT, item.itemRoot));
  const manifestPath = path.join(itemDir, item.loadedFiles.find(file => file.target.endsWith("manifest.json")).source);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")); manifest.version = components.join(".");
  await writeFile(manifestPath, JSON.stringify(manifest));
  const logPath = path.join(itemDir, "changelog.json"); const log = JSON.parse(await readFile(logPath, "utf8"));
  log[manifest.version] = { summary: "Three-way merge validation", changes: ["Preserve project customization"] };
  await writeFile(logPath, JSON.stringify(log));
  await writeFile(path.join(nextRoot, "release.json"), JSON.stringify(nextDescriptor));
  const merging = new AgentUIUpdateService(new InstalledUpdateSourceProvider(nextRoot, history));
  const mergePlan = await merging.plan(root, [selected], "0.1.2");
  assert.equal(mergePlan.requiresMerge, true);
  await assert.rejects(merging.execute(root, mergePlan.id));
  const merge = await merging.merge(root, mergePlan.id);
  assert(merge.files.some(file => file.local?.includes("user customization") && !file.base?.includes("user customization")));
  for (const file of merge.files) {
    if (file.target === null) await rm(path.join(root, file.path), { force: true });
    else await put(root, file.path, file.target + (file.local?.includes("user customization") ? "\n// user customization\n" : ""));
  }
  await merging.adopt(root, mergePlan.id);
  assert((await readFile(path.join(source, selectedFile.target), "utf8")).includes("user customization"));
  assert.equal(JSON.parse(await readFile(lockPath, "utf8")).items[`plugin/${selected}`].pluginVersion, manifest.version);
  console.log("Real three-way merge and verified baseline adoption preserve user customization.");
  // Missing history must be explicit rather than silently using the current release as BASE.
  await assert.rejects(new InstalledUpdateSourceProvider(targetRoot).resolveRelease(baselineVersion), /Historical Source Release/);
  console.log(`Real selective upgrade ${selected}: passed; ${unselected} bytes and version unchanged; missing historical BASE rejected.`);
  if (process.argv.includes("--keep")) console.log(`Kept validation project: ${root}`);
} finally {
  if (!process.argv.includes("--keep")) await rm(base, { recursive: true, force: true });
}
