import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { publicModules, publicPackageName } from "./build-public-packages.mjs";
import { spawnPnpmSync } from "./pnpm-process.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const packageNames = new Set(publicModules.map(publicPackageName));
const dependencyFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

async function entries(directory) {
  try { return await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}

// Logical paths use / on every platform; only filesystem access uses native paths.
export async function setPackageVersions({ root = repositoryRoot, version, dryRun = false, updateLockfile = true } = {}) {
  if (typeof version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version) ||
      version.split(".").some(part => !Number.isSafeInteger(Number(part)))) {
    throw new Error("Provide an exact stable version, for example: pnpm release:version:set 0.0.5");
  }
  const records = new Map();
  async function load(file, fields, required = false) {
    const target = path.join(root, ...file.split("/"));
    let original;
    try { original = await readFile(target, "utf8"); }
    catch (error) { if (!required && error.code === "ENOENT") return; throw error; }
    records.set(file, { file, target, original, item: JSON.parse(original), fields });
  }
  await load("package.json", dependencyFields, true);
  for (const directory of ["packages", "apps", "examples"]) {
    for (const entry of await entries(path.join(root, directory))) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) await load(`${directory}/${entry.name}/package.json`, dependencyFields);
    }
  }
  for (const id of publicModules) {
    const file = `packages/${id}/package.json`;
    const record = records.get(file);
    if (record?.item.name !== publicPackageName(id)) throw new Error(`Missing or unexpected public package identity: ${file}`);
    record.item.version = version;
  }
  async function resources(directory) {
    for (const entry of await entries(path.join(root, ...directory.split("/")))) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await resources(file);
      else if (entry.isFile() && entry.name === "item.json") await load(file, ["packages"]);
    }
  }
  await resources("packages/plugins/resources/registry/items");
  const edits = [];
  for (const record of records.values()) {
    const { item, fields } = record;
    let changed = JSON.stringify(item) !== JSON.stringify(JSON.parse(record.original));
    for (const field of fields) {
      for (const [name, range] of Object.entries(item[field] ?? {})) {
        // Preserve workspace/local/alias declarations. pnpm packs workspace:* as
        // the selected package's exact version, without fetching it from npm.
        if (packageNames.has(name) && typeof range === "string" && !/^[\w+.-]+:/u.test(range) && range !== version) {
          item[field][name] = version;
          changed = true;
        }
      }
    }
    if (changed) edits.push({ ...record, text: JSON.stringify(item, null, 2) + "\n" });
  }
  const files = edits.map(edit => edit.file);
  if (dryRun) return { version, files };
  try {
    for (const edit of edits) await writeFile(edit.target, edit.text);
    // Also repair a stale lockfile when manifests already have the requested version.
    if (updateLockfile) {
      const result = spawnPnpmSync(["install", "--lockfile-only", "--ignore-scripts", "--no-frozen-lockfile"], { cwd: root, stdio: "inherit" });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error("Lockfile update failed; inspect pnpm-lock.yaml before retrying");
    }
  } catch (error) {
    for (const edit of edits) {
      if (await readFile(edit.target, "utf8") === edit.text) await writeFile(edit.target, edit.original);
    }
    throw error;
  }
  return { version, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { "dry-run": { type: "boolean", default: false } } });
  if (positionals.length !== 1) throw new Error("Usage: pnpm release:version:set <x.y.z> [--dry-run]");
  const result = await setPackageVersions({ version: positionals[0], dryRun: values["dry-run"] });
  console.log(`${values["dry-run"] ? "Preview" : "Set"}: six public packages -> ${result.version}`);
  for (const file of result.files) console.log(file);
  console.log(values["dry-run"] ? "No files changed; execution will also update pnpm-lock.yaml." : "Lockfile updated. No Git staging, commit, tag or publication performed.");
}
