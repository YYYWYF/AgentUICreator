import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { publicModules, publicPackageName } from "./build-public-packages.mjs";
import { spawnPnpm, spawnPnpmSync } from "./pnpm-process.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const dependencyFields = ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"];
const runtimeFields = dependencyFields.slice(0, 3);
const packageNames = new Set(publicModules.map(publicPackageName));
const sourcePaths = ["packages", "scripts", "tsconfig.json", "package.json"];
const json = value => JSON.stringify(value, null, 2) + "\n";
const git = (root, args) => execFileSync("git", args, { cwd: root, maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const paths = bytes => bytes.toString().split("\0").filter(Boolean);
const normalize = (file, bytes) => /\.(?:[cm]?[jt]sx?|json|md|css|html|svg|ya?ml|txt|snap)$/u.test(file)
  ? Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n")) : bytes;

function bumpVersion(version, bump) {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isSafeInteger(part) || part < 0)) {
    throw new Error(`Expected a stable x.y.z version, received ${version}`);
  }
  const index = { major: 0, minor: 1, patch: 2 }[bump];
  parts[index]++;
  for (let next = index + 1; next < 3; next++) parts[next] = 0;
  return parts.join(".");
}

function compareVersions(left, right) {
  const a = left.split(".").map(Number), b = right.split(".").map(Number);
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}

// Git supplies tracked and new source files, excluding ignored build output.
// Logical paths always use /; native paths are used only for filesystem access.
async function readSources(root) {
  const listed = paths(git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...sourcePaths]));
  const sources = new Map();
  for (const file of [...new Set(listed)].sort()) {
    try {
      sources.set(file, normalize(file, await readFile(path.join(root, ...file.split("/")))));
    } catch (error) {
      if (error.code !== "ENOENT") throw error; // Tracked deletions are changes too.
    }
  }
  return sources;
}

function publishedSources(root, ref, current) {
  const previous = new Map(current);
  const tracked = new Set(paths(git(root, ["ls-tree", "-r", "--name-only", "-z", ref, "--", ...sourcePaths])));
  const changed = paths(git(root, ["diff", "--no-renames", "--name-only", "-z", ref, "--", ...sourcePaths]));
  const untracked = paths(git(root, ["ls-files", "-z", "--others", "--exclude-standard", "--", ...sourcePaths]));
  for (const file of new Set([...changed, ...untracked])) {
    if (tracked.has(file)) previous.set(file, normalize(file, git(root, ["show", `${ref}:${file}`])));
    else previous.delete(file);
  }
  return previous;
}

export async function readPublishedPackage({ root, name, publishConfig }) {
  const query = spec => new Promise((resolve, reject) => {
    const args = ["view", spec, "name", "version", "versions", "gitHead", "agentUISource", ...runtimeFields, "--json", "--prefer-online", "--offline=false", "--fetch-retries=0", "--fetch-timeout=15000"];
    if (publishConfig?.registry) {
      args.push(`--registry=${publishConfig.registry}`);
      if (name.startsWith("@")) args.push(`--${name.split("/")[0]}:registry=${publishConfig.registry}`);
    }
    const child = spawnPnpm(args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`npm lookup timed out: ${name}`)); }, 20_000);
    child.stdout.on("data", bytes => { output += bytes; });
    child.stderr.resume();
    child.once("error", error => { clearTimeout(timeout); reject(error); });
    child.once("close", code => {
      clearTimeout(timeout);
      let metadata;
      try { metadata = JSON.parse(output); }
      catch { reject(new Error(`Cannot read npm publication metadata: ${name}`)); return; }
      if (code !== 0) {
        if (metadata.error?.code === "E404" && spec === name) resolve(undefined);
        else reject(new Error(`Cannot query npm publication: ${name} (${metadata.error?.code ?? code})`));
      } else if (metadata.name !== name || !/^\d+\.\d+\.\d+$/u.test(metadata.version)) {
        reject(new Error(`Expected stable npm publication metadata: ${name}`));
      } else resolve(metadata);
    });
  });
  const metadata = await query(name);
  if (!metadata) return undefined;
  // A moved latest tag must not cause us to reuse a version already on npm.
  const version = [...new Set([metadata.version, ...(metadata.versions ?? [])])]
    .filter(version => /^\d+\.\d+\.\d+$/u.test(version)).sort(compareVersions).at(-1);
  return version === metadata.version ? metadata : query(`${name}@${version}`);
}

function sourceHash(id, sources) {
  const prefix = `packages/${id}/`;
  if (!sources.has(`${prefix}package.json`)) return undefined;
  const files = new Set([...sources.keys()].filter(file => file.startsWith(prefix)));
  files.add("tsconfig.json");
  // Include shared scripts actually used by this package and their shared imports.
  const pkg = JSON.parse(sources.get(`${prefix}package.json`));
  function includeScript(file) {
    if (!file.startsWith("scripts/") || files.has(file) || !sources.has(file)) return;
    files.add(file);
    for (const [, relative] of sources.get(file).toString().matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["'](\.[^"']+)["']/gu)) {
      includeScript(path.posix.join(path.posix.dirname(file), relative));
    }
  }
  for (const command of Object.values(pkg.scripts ?? {})) {
    for (const [relative] of command.matchAll(/(?:\.\.\/)+scripts\/[\w.-]+\.mjs/gu)) {
      includeScript(path.posix.join(prefix, relative));
    }
  }
  for (const file of [...files].filter(file => /\.[cm]?[jt]s$/u.test(file) && sources.has(file))) {
    for (const [, relative] of sources.get(file).toString().matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["'](\.[^"']+)["']/gu)) {
      includeScript(path.posix.join(path.posix.dirname(file), relative));
    }
  }
  const hash = createHash("sha256");
  const { engines, packageManager, pnpm } = JSON.parse(sources.get("package.json"));
  hash.update(json({ engines, packageManager, pnpm }));
  for (const file of [...files].sort()) {
    let bytes = sources.get(file);
    if (!bytes) continue;
    if (file === `${prefix}package.json`) {
      const { agentUI, agentUISource, version, ...source } = JSON.parse(bytes);
      bytes = Buffer.from(json(withoutInternalVersions(source, dependencyFields)));
    } else if (file.startsWith("packages/plugins/resources/registry/items/") && file.endsWith("/item.json")) {
      bytes = Buffer.from(json(withoutInternalVersions(JSON.parse(bytes), ["packages"])));
    }
    hash.update(file).update("\0").update(bytes).update("\0");
  }
  return hash.digest("hex");
}

// Ignore fields maintained by this command so preparing the same release twice
// does not turn dependency-only changes into new source changes.
function withoutInternalVersions(item, fields) {
  for (const field of fields) for (const [name, range] of Object.entries(item[field] ?? {})) {
    if (packageNames.has(name) && !/^[\w+.-]+:/u.test(range)) item[field][name] = "<release-version>";
  }
  return item;
}

export async function versionPackages({ root = repositoryRoot, bump = "patch", dryRun = false, since, updateLockfile = true, readPublished = readPublishedPackage } = {}) {
  if (!["patch", "minor", "major"].includes(bump)) throw new Error("Use --bump patch, minor or major");
  const sources = await readSources(root);
  const packages = publicModules.map(id => ({ id, file: `packages/${id}/package.json`, ...JSON.parse(sources.get(`packages/${id}/package.json`)) }));
  const published = new Map(await Promise.all(packages.map(async pkg => [pkg.name, await readPublished({ root, name: pkg.name, publishConfig: pkg.publishConfig })])));
  const previousSources = new Map();
  function baselineHash(pkg) {
    const metadata = published.get(pkg.name);
    if (!metadata) return undefined;
    if (metadata.agentUISource?.sha256) return metadata.agentUISource.sha256;
    const ref = since ?? metadata.gitHead;
    if (!ref) throw new Error(`Published ${pkg.name}@${metadata.version} has no source fingerprint or gitHead; use --since <published-commit> once`);
    if (!previousSources.has(ref)) previousSources.set(ref, publishedSources(root, ref, sources));
    return sourceHash(pkg.id, previousSources.get(ref));
  }
  const resources = [...sources].filter(([file]) => file.startsWith("packages/plugins/resources/registry/items/") && file.endsWith("/item.json"))
    .map(([file, bytes]) => ({ file, item: JSON.parse(bytes) }));
  const hashes = new Map(packages.map(pkg => [pkg.name, sourceHash(pkg.id, sources)]));
  const selected = new Map();
  for (const pkg of packages) {
    const metadata = published.get(pkg.name);
    if (!metadata || baselineHash(pkg) !== hashes.get(pkg.name)) selected.set(pkg.name, "source");
    else if (compareVersions(pkg.version, metadata.version) > 0) selected.set(pkg.name, "pending");
  }
  const targetVersion = pkg => {
    const metadata = published.get(pkg.name);
    const proposed = metadata && selected.has(pkg.name) ? bumpVersion(metadata.version, selected.get(pkg.name) === "source" ? bump : "patch") : metadata?.version ?? pkg.version;
    return compareVersions(pkg.version, proposed) > 0 ? pkg.version : proposed;
  };
  function requirements(pkg) {
    const names = runtimeFields.flatMap(field => Object.keys(pkg[field] ?? {}));
    if (pkg.id === "plugins") names.push(...resources.flatMap(({ item }) => Object.keys(item.packages ?? {})));
    return [...new Set(names)].filter(name => name !== pkg.name && packageNames.has(name));
  }
  // A new published dependency requires a new consumer release. Development-only
  // links do not propagate releases (Web Component and Creator have such a cycle).
  let changed;
  do {
    changed = false;
    for (const pkg of packages) {
      if (selected.has(pkg.name)) continue;
      const metadata = published.get(pkg.name);
      const recorded = metadata?.agentUISource?.dependencies ?? Object.assign({}, ...runtimeFields.map(field => metadata?.[field]));
      const dependency = requirements(pkg).find(name => selected.has(name) && recorded[name] !== targetVersion(packages.find(pkg => pkg.name === name)));
      if (dependency) { selected.set(pkg.name, dependency); changed = true; }
    }
  } while (changed);
  const releases = packages.filter(pkg => selected.has(pkg.name)).map(pkg => ({ name: pkg.name, from: published.get(pkg.name)?.version, to: targetVersion(pkg), reason: selected.get(pkg.name) }));
  if (!releases.length || dryRun) return releases;

  const versions = new Map(packages.map(pkg => [pkg.name, targetVersion(pkg)]));
  const edits = [];
  const records = packages.map(({ file, id, ...item }) => ({ file, item, fields: dependencyFields }));
  records.push(...resources.map(resource => ({ ...resource, fields: ["packages"] })));
  for (const { file, item, fields } of records) {
    if (file.endsWith("/package.json")) {
      item.version = versions.get(item.name);
      if (selected.has(item.name)) item.agentUISource = { sha256: hashes.get(item.name), dependencies: Object.fromEntries(requirements(packages.find(pkg => pkg.name === item.name)).map(name => [name, versions.get(name)])) };
    }
    for (const field of fields) {
      for (const [name, range] of Object.entries(item[field] ?? {})) {
        // workspace:* is converted to the exact new version by pnpm pack/publish.
        if (versions.has(name) && !/^[\w+.-]+:/u.test(range)) item[field][name] = versions.get(name);
      }
    }
    const text = json(item);
    const target = path.join(root, ...file.split("/"));
    const original = await readFile(target, "utf8");
    if (text !== original) edits.push({ target, original, text });
    sources.set(file, Buffer.from(text));
  }
  try {
    for (const edit of edits) await writeFile(edit.target, edit.text);
    if (updateLockfile && edits.length) {
      const result = spawnPnpmSync(["install", "--lockfile-only", "--ignore-scripts", "--no-frozen-lockfile"], { cwd: root, stdio: "inherit" });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error("Lockfile update failed; inspect any lockfile changes before retrying");
    }
  } catch (error) {
    for (const edit of edits) {
      if (await readFile(edit.target, "utf8") === edit.text) await writeFile(edit.target, edit.original);
    }
    throw error;
  }
  return releases;
}

export async function versionAndTagPackages({ root = repositoryRoot, ...options } = {}) {
  const releases = await versionPackages({ root, ...options });
  if (options.dryRun || !releases.length) return { releases };

  // Commit the package sources together with their versions. A tag on the old
  // HEAD would omit the working-tree edits that produced this release.
  const candidates = [...sourcePaths, "pnpm-lock.yaml", "releases/compatibility.json"];
  const files = paths(git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...candidates]));
  const releasePaths = candidates.filter(directory => files.some(file => file === directory || file.startsWith(`${directory}/`)));
  git(root, ["add", "--all", "--", ...releasePaths]);
  if (git(root, ["diff", "--cached", "--name-only", "--", ...releasePaths]).length) {
    // --only keeps unrelated staged files out of this commit.
    git(root, ["commit", "--only", "-m", "chore(release): update Agent UI package versions", "--", ...releasePaths]);
  }
  const commit = git(root, ["rev-parse", "HEAD"]).toString().trim();
  const existingTag = git(root, ["tag", "--points-at", commit, "--list", "release-*"]).toString().trim().split("\n")[0];
  if (existingTag) return { releases, tag: existingTag, commit };
  const timestamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
  const tag = `release-${timestamp}-${commit.slice(0, 8)}`;
  const summary = releases.map(release => `${release.name}: ${release.from ?? "initial"} -> ${release.to}`).join("\n");
  git(root, ["tag", "-a", tag, "-m", `Agent UI source release\n\n${summary}`, commit]);
  return { releases, tag, commit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { bump: { type: "string", default: "patch" }, "dry-run": { type: "boolean", default: false }, since: { type: "string" } } });
  const { releases, tag } = await versionAndTagPackages({ bump: values.bump, dryRun: values["dry-run"], since: values.since });
  for (const release of releases) console.log(`${release.name}: ${release.from ?? "unpublished"} → ${release.to} (${release.reason})`);
  if (!releases.length) console.log("No package changes since the last release.");
  if (tag) console.log(`Local source release tag: ${tag}`);
}
