import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const modules = ["core", "renderer", "runtime", "plugins", "creator", "web-component"];
const receiptName = "build-integrity.json";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const json = async file => JSON.parse(await readFile(file, "utf8"));
export const logicalRelativePath = (root, file, paths = path) => paths.relative(root, file).split(paths.sep).join("/");
const native = (root, file) => path.join(root, ...file.split("/"));
const ignored = new Set(["node_modules", "dist", "tests", "coverage", "test-results", "playwright-report"]);

function locations(id, root) {
  if (!modules.includes(id)) throw new Error(`Unknown public package: ${id}`);
  const directory = path.join(root, "packages", id);
  return { directory, receipt: path.join(directory, "dist", receiptName), pending: path.join(root, "node_modules", ".cache", "agent-ui-package-build", `${id}.json`) };
}

async function tree(root, accept = () => true) {
  const files = {};
  async function visit(relative) {
    if (!accept(relative)) return;
    let entries;
    try { entries = await readdir(native(root, relative), { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const file = path.posix.join(relative, entry.name);
      if (!accept(file)) continue;
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) files[logicalRelativePath(root, native(root, file))] = digest(await readFile(native(root, file)));
      else throw new Error(`Unsupported build input/output: ${file}`);
    }
  }
  await visit("");
  return files;
}

async function sourceInputs(id, root) {
  const inputs = {};
  const visited = new Set();
  async function include(owner) {
    if (visited.has(owner)) return;
    visited.add(owner);
    const directory = locations(owner, root).directory;
    const pkg = await json(path.join(directory, "package.json"));
    const layout = await json(path.join(directory, "source-layout.json")).catch(error => { if (error.code === "ENOENT") return { files: [] }; throw error; });
    const generated = new Set(layout.files.map(file => file.view));
    const files = await tree(directory, file => !file.split("/").some(part => ignored.has(part) || part.startsWith(".")) &&
      !/(?:^|\/)internal\/(?:vendor-generated|adapters-generated)(?:\/|$)/u.test(file) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file) && !/\.(?:tsbuildinfo|tgz)$/u.test(file) && !generated.has(file));
    // These fields are generated from exports/release history during build/prepack.
    const { agentUI, types, typesVersions, ...authored } = pkg;
    files["package.json"] = digest(JSON.stringify(authored));
    for (const [file, hash] of Object.entries(files)) inputs[`packages/${owner}/${file}`] = hash;
    const dependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies });
    for (const dependency of dependencies) {
      const target = modules.find(name => dependency === `@za38.03/agent-ui-${name}`);
      if (target) await include(target);
    }
  }
  await include(id);
  // Shared build helpers/configuration also participate, without relying on Git or mtimes.
  for (const [file, hash] of Object.entries(await tree(path.join(root, "scripts"), file => !file.endsWith(".test.mjs")))) inputs[`scripts/${file}`] = hash;
  for (const file of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", ".npmrc", ".pnpmfile.cjs", "pnpmfile.cjs", "releases/compatibility.json"]) {
    const bytes = await readFile(native(root, file)).catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
    if (bytes) inputs[file] = digest(bytes);
  }
  if (visited.has("creator")) for (const [file, hash] of Object.entries(await tree(path.join(root, "artifacts/creator-documentation")))) inputs[`artifacts/creator-documentation/${file}`] = hash;
  return inputs;
}

function assertSame(expected, actual, label) {
  const changed = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].filter(file => expected[file] !== actual[file]);
  if (changed.length) throw new Error(`${label}: ${changed.slice(0, 5).join(", ")}`);
}

async function validateTemplates(root) {
  const directory = locations("plugins", root).directory;
  const pkg = await json(path.join(directory, "package.json"));
  const catalog = await json(path.join(directory, "dist/catalog.json"));
  if (catalog.package?.name !== pkg.name || catalog.package?.version !== pkg.version) throw new Error(`Stale Plugins catalog: expected ${pkg.name}@${pkg.version}, found ${catalog.package?.version}`);
  const sourceRoot = path.join(directory, "resources/registry");
  const builtRoot = path.join(directory, "dist/resources/registry");
  const source = await json(path.join(sourceRoot, "registry.json"));
  const built = await json(path.join(builtRoot, "registry.json"));
  const versions = new Map(await Promise.all(modules.map(async id => {
    const identity = await json(path.join(locations(id, root).directory, "package.json"));
    return [identity.name, identity.version];
  })));
  for (const entry of built.items) {
    const owner = source.items.find(item => item.id === entry.id && item.path === entry.path);
    if (!owner) throw new Error(`Stale template registry entry: ${entry.id}`);
    const authored = await json(native(sourceRoot, owner.path));
    const emitted = await json(native(builtRoot, entry.path));
    if (JSON.stringify(authored) !== JSON.stringify(emitted)) throw new Error(`Stale built template: ${entry.id}`);
    // Exact template pins track their respective owners, never one shared version.
    for (const [name, version] of Object.entries(authored.packages ?? {})) {
      if (versions.has(name) && /^\d+\.\d+\.\d+(?:[-+].*)?$/u.test(version) && versions.get(name) !== version) {
        throw new Error(`Stale template requirement: ${entry.id}: ${name} requires ${version}, package is ${versions.get(name)}`);
      }
    }
  }
}

async function outputFiles(directory) {
  const files = await tree(path.join(directory, "dist"), file => file !== receiptName);
  if (!Object.keys(files).length) throw new Error("Build output is missing");
  return files;
}

/** Invalidate before compilation so an interrupted/failed build cannot reuse a receipt. */
export async function beginPackageBuild(id, root = repositoryRoot) {
  const { receipt, pending } = locations(id, root);
  await rm(receipt, { force: true });
  await rm(pending, { force: true });
  const inputs = await sourceInputs(id, root);
  await mkdir(path.dirname(pending), { recursive: true });
  await writeFile(pending, JSON.stringify(inputs));
}

/** Only the end of a successful build creates a publishable receipt. */
export async function recordPackageBuild(id, root = repositoryRoot) {
  const { directory, receipt, pending } = locations(id, root);
  const inputs = await sourceInputs(id, root);
  assertSame(await json(pending), inputs, "Build inputs changed during compilation");
  if (id === "plugins") await validateTemplates(root);
  const pkg = await json(path.join(directory, "package.json"));
  await writeFile(receipt, JSON.stringify({ schemaVersion: 1, package: { name: pkg.name, version: pkg.version }, inputs, outputs: await outputFiles(directory) }, null, 2) + "\n");
  await rm(pending);
}

/** Read-only gate: never repair metadata or silently rebuild at publication time. */
export async function checkPackageBuild(id, root = repositoryRoot) {
  const { directory, receipt } = locations(id, root);
  try {
    const recorded = await json(receipt);
    const pkg = await json(path.join(directory, "package.json"));
    if (recorded.schemaVersion !== 1 || recorded.package?.name !== pkg.name || recorded.package?.version !== pkg.version) throw new Error("Build receipt package identity differs from package.json");
    assertSame(recorded.inputs, await sourceInputs(id, root), "Stale build inputs");
    assertSame(recorded.outputs, await outputFiles(directory), "Changed or missing build output");
    if (id === "plugins") await validateTemplates(root);
  } catch (cause) {
    throw new Error(`Cannot pack/publish @za38.03/agent-ui-${id}: ${cause.message}. Run pnpm build:package after preparing versions and templates.`, { cause });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [action, ...ids] = process.argv.slice(2);
  const run = { begin: beginPackageBuild, record: recordPackageBuild, check: checkPackageBuild }[action];
  if (!run) throw new Error("Usage: node scripts/package-build-integrity.mjs <begin|record|check> [package ...]");
  for (const id of ids.length ? ids : modules) await run(id);
}
