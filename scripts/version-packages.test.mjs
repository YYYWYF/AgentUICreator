import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { publicModules, publicPackageName as name } from "./build-public-packages.mjs";
import { versionPackages as runVersionPackages, versionAndTagPackages as runVersionAndTagPackages, readPublishedPackage } from "./version-packages.mjs";
import { syncPackageReleaseMetadata } from "./sync-package-release-metadata.mjs";
import { setPackageVersions } from "./set-package-versions.mjs";

const registries = new Map();
const withRegistry = options => ({ ...options, readPublished: options.readPublished ?? (async ({ name }) => registries.get(options.root).get(name)) });
const versionPackages = options => runVersionPackages(withRegistry(options));
const versionAndTagPackages = options => runVersionAndTagPackages(withRegistry(options));

async function fixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), "agent-ui versions 中文 space-"));
  const put = async (file, text) => {
    const target = path.join(root, ...file.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text);
  };
  const read = async file => JSON.parse(await readFile(path.join(root, ...file.split("/")), "utf8"));
  let release = 0;
  const registry = new Map();
  registries.set(root, registry);
  const recordPublished = (ids = publicModules) => {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const manifests = publicModules.map(id => JSON.parse(readFileSync(path.join(root, "packages", id, "package.json"), "utf8")));
    const versions = Object.fromEntries(manifests.map(pkg => [pkg.name, pkg.version]));
    for (const id of ids) {
      const pkg = manifests.find(pkg => pkg.name === name(id));
      for (const field of ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"]) {
        for (const [dependency, range] of Object.entries(pkg[field] ?? {})) if (range === "workspace:*") pkg[field][dependency] = versions[dependency];
      }
      registry.set(pkg.name, { ...pkg, gitHead: commit });
    }
  };
  const publish = () => {
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["-c", "user.name=Version Test", "-c", "user.email=version@example.test", "commit", "--allow-empty", "--quiet", "-m", "Publish"], { cwd: root });
    execFileSync("git", ["tag", `release-${++release}`], { cwd: root });
    recordPublished();
  };
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Version Test"], { cwd: root });
    execFileSync("git", ["config", "user.email", "version@example.test"], { cwd: root });
    await put(".gitignore", "dist/\nnode_modules/\n");
    // Fixture versions are intentionally unpublished; don't fetch auto peers.
    await put(".npmrc", "auto-install-peers=false\n");
    await put("package.json", JSON.stringify({ private: true, packageManager: "pnpm@8.12.0" }));
    await put("pnpm-workspace.yaml", 'packages:\n  - "packages/*"\n');
    await put("tsconfig.json", "{}\n");
    await put("scripts/build.mjs", 'import "./helper.mjs";\n');
    await put("scripts/helper.mjs", "export const helper = 1;\n");
    const dependencies = {
      plugins: { [name("core")]: "workspace:*" },
      runtime: { [name("plugins")]: "workspace:*", [name("renderer")]: "workspace:*" },
      "web-component": { [name("runtime")]: "workspace:*" },
      creator: { [name("web-component")]: "workspace:*" },
    };
    for (const id of publicModules) {
      await put(`packages/${id}/src/index.ts`, `export const id = ${JSON.stringify(id)};\n`);
      await put(`packages/${id}/package.json`, JSON.stringify({
        name: name(id), version: id === "renderer" ? "2.3.4" : "0.0.1",
        scripts: { build: "node ../../scripts/build.mjs" },
        dependencies: dependencies[id] ?? {},
        ...(id === "plugins" ? { peerDependencies: { [name("renderer")]: "2.3.4" } } : {}),
        ...(id === "plugins" ? { devDependencies: { [name("renderer")]: "2.3.4" } } : {}),
        ...(id === "web-component" ? { devDependencies: { [name("creator")]: "workspace:*" } } : {}),
      }, null, 2) + "\n");
    }
    await run({ root, put, read, publish, registry, recordPublished });
  } finally { registries.delete(root); await rm(root, { recursive: true, force: true }); }
}

test("first release, preview and no source changes after publication", () => fixture(async ({ root, put, read, publish }) => {
  const preview = await versionPackages({ root, dryRun: true });
  assert.equal(preview.length, 6);
  assert.equal((await read("packages/core/package.json")).version, "0.0.1");
  const releases = await versionPackages({ root, updateLockfile: false });
  assert.equal(releases.find(release => release.name === name("renderer")).to, "2.3.4");
  assert.equal((await read("packages/plugins/package.json")).peerDependencies[name("renderer")], "2.3.4");
  publish();
  await put("packages/core/dist/generated.js", "ignored");
  const pkg = await read("packages/core/package.json");
  await put("packages/core/package.json", JSON.stringify({ ...pkg, agentUI: { compatibility: "generated" } }));
  await put("packages/core/src/index.ts", 'export const id = "core";\r\n');
  assert.deepEqual(await versionPackages({ root, updateLockfile: false }), []);
}));

test("explicit versions update all six packages, consumers and resource requirements without touching Git or history", () => fixture(async ({ root, put, read, publish }) => {
  const resource = "packages/plugins/resources/registry/items/foundation/core/item.json";
  await put(resource, JSON.stringify({ id: "foundation/core", packages: { [name("core")]: "0.0.1", react: "19.1.1" } }));
  const consumer = "examples/custom-host/package.json";
  await put(consumer, JSON.stringify({ name: "custom-host", version: "1.2.3", dependencies: { [name("core")]: "^0.0.1", [name("plugins")]: "workspace:*", react: "19.1.1" }, optionalDependencies: { [name("renderer")]: "~2.3.4" }, devDependencies: { [name("creator")]: "file:../../packages/creator" } }));
  await put("packages/plugins/resources/registry/release.json", '{"releaseVersion":"historical"}');
  await put("releases/compatibility.json", '{"schemaVersion":1,"releases":[]}');
  publish();
  await put("notes.md", "staged user edit");
  execFileSync("git", ["add", "notes.md"], { cwd: root });
  const gitState = () => [
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }),
    execFileSync("git", ["tag", "--list"], { cwd: root, encoding: "utf8" }),
    execFileSync("git", ["diff", "--cached"], { cwd: root, encoding: "utf8" }),
  ];
  const before = gitState();
  const preview = await setPackageVersions({ root, version: "0.0.5", dryRun: true });
  assert.ok(preview.files.includes(resource));
  assert.ok(preview.files.includes(consumer));
  assert.equal((await read("packages/core/package.json")).version, "0.0.1");
  await setPackageVersions({ root, version: "0.0.5", updateLockfile: false });
  for (const id of publicModules) assert.equal((await read(`packages/${id}/package.json`)).version, "0.0.5");
  const host = await read(consumer);
  assert.equal(host.version, "1.2.3");
  assert.equal(host.dependencies[name("core")], "0.0.5");
  assert.equal(host.dependencies[name("plugins")], "workspace:*");
  assert.equal(host.dependencies.react, "19.1.1");
  assert.equal(host.optionalDependencies[name("renderer")], "0.0.5");
  assert.equal(host.devDependencies[name("creator")], "file:../../packages/creator");
  assert.equal((await read(resource)).packages[name("core")], "0.0.5");
  assert.equal((await read(resource)).packages.react, "19.1.1");
  assert.equal((await read("packages/plugins/package.json")).peerDependencies[name("renderer")], "0.0.5");
  assert.equal((await read("packages/plugins/resources/registry/release.json")).releaseVersion, "historical");
  assert.deepEqual(await read("releases/compatibility.json"), { schemaVersion: 1, releases: [] });
  assert.deepEqual(gitState(), before);
  assert.deepEqual((await setPackageVersions({ root, version: "0.0.5", dryRun: true })).files, []);
}));

test("explicit versions reject malformed input before writes and recover manifests after pnpm failure", () => fixture(async ({ root, put, read }) => {
  const original = await read("packages/core/package.json");
  for (const version of [undefined, "latest", "0.0", "01.0.5", "0.0.5-beta.1", "0.0.5 && echo bad"]) {
    await assert.rejects(setPackageVersions({ root, version }), /exact stable version/u);
  }
  await put("pnpm.cjs", "process.exit(1);\n");
  const previous = process.env.npm_execpath;
  process.env.npm_execpath = path.join(root, "pnpm.cjs");
  try { await assert.rejects(setPackageVersions({ root, version: "0.0.5" }), /Lockfile update failed/u); }
  finally {
    if (previous === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = previous;
  }
  assert.deepEqual(await read("packages/core/package.json"), original);
}));

test("explicit versions synchronize the real pnpm lockfile including peers and remain idempotent", () => fixture(async ({ root, read }) => {
  await setPackageVersions({ root, version: "0.0.5" });
  assert.equal((await read("packages/plugins/package.json")).dependencies[name("core")], "workspace:*");
  const lock = await readFile(path.join(root, "pnpm-lock.yaml"), "utf8");
  assert.match(lock, /specifier: 0\.0\.5/u);
  assert.match(lock, /specifier: workspace:\*/u);
  await setPackageVersions({ root, version: "0.0.5" });
  assert.equal(await readFile(path.join(root, "pnpm-lock.yaml"), "utf8"), lock);
}));

test("changes since the last publication propagate without a dev cycle or repeated bumps", () => fixture(async ({ root, put, read, publish }) => {
  publish();
  await put("packages/creator/src/new.ts", "export const added = true;\n");
  let releases = await versionPackages({ root, bump: "minor", updateLockfile: false });
  assert.deepEqual(releases.map(release => [release.name, release.to]), [[name("creator"), "0.1.0"]]);
  assert.deepEqual(await versionPackages({ root, bump: "minor", updateLockfile: false }), releases);
  publish();
  await rm(path.join(root, "packages", "core", "src", "index.ts"));
  releases = await versionPackages({ root, bump: "minor", updateLockfile: false });
  assert.deepEqual(new Set(releases.map(release => release.name)), new Set(["core", "plugins", "runtime", "web-component", "creator"].map(name)));
  assert.equal(releases.find(release => release.name === name("core")).to, "0.1.0");
  assert.equal(releases.find(release => release.name === name("creator")).to, "0.1.1");
  const before = await read("packages/creator/package.json");
  await versionPackages({ root, bump: "minor", updateLockfile: false });
  assert.deepEqual(await read("packages/creator/package.json"), before);
  publish();
  assert.deepEqual(await versionPackages({ root, updateLockfile: false }), []);
}));

test("committed changes and shared helpers imported from package scripts are detected", () => fixture(async ({ root, put, read, publish }) => {
  const pkg = await read("packages/core/package.json");
  pkg.scripts.build = "node scripts/build.mjs";
  await put("packages/core/package.json", JSON.stringify(pkg, null, 2) + "\n");
  await put("packages/core/scripts/build.mjs", 'import "../../../scripts/helper.mjs";\n');
  publish();
  await put("scripts/helper.mjs", "export const helper = 2;\n");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=Version Test", "-c", "user.email=version@example.test", "commit", "--quiet", "-m", "Change source"], { cwd: root });
  assert.equal((await versionPackages({ root, updateLockfile: false })).length, 6);
}));

test("the real lockfile update keeps workspace references and records the new peers", () => fixture(async ({ root, put, read, publish }) => {
  publish();
  await put("packages/renderer/src/new.ts", "export const renderer = true;\n");
  await versionPackages({ root });
  const lock = await readFile(path.join(root, "pnpm-lock.yaml"), "utf8");
  assert.match(lock, /specifier: workspace:\*/u);
  assert.match(lock, /specifier: 2\.3\.5/u);
  assert.equal((await read("packages/plugins/package.json")).dependencies[name("core")], "workspace:*");
  const before = await readFile(path.join(root, "pnpm-lock.yaml"), "utf8");
  await versionPackages({ root });
  assert.equal(await readFile(path.join(root, "pnpm-lock.yaml"), "utf8"), before);
}));

test("published template requirements follow package versions and propagate a Plugins release", () => fixture(async ({ root, put, read, publish }) => {
  const file = "packages/plugins/resources/registry/items/integration/bridge/item.json";
  await put(file, JSON.stringify({ id: "integration/bridge", packages: { [name("web-component")]: "0.0.1", react: "19.1.1" } }));
  publish();
  await put("packages/web-component/src/new.ts", "export const bridge = true;\n");
  const releases = await versionPackages({ root, updateLockfile: false });
  assert.deepEqual(new Set(releases.map(release => release.name)), new Set(["web-component", "plugins", "runtime", "creator"].map(name)));
  assert.equal((await read(file)).packages[name("web-component")], "0.0.2");
  assert.equal((await read(file)).packages.react, "19.1.1");
  assert.deepEqual((await versionPackages({ root, updateLockfile: false })).map(({ name, from, to }) => ({ name, from, to })), releases.map(({ name, from, to }) => ({ name, from, to })));
}));

test("an explicit release baseline works and a failed lock update restores this command's edits", () => fixture(async ({ root, put, read, publish }) => {
  publish();
  const before = await read("packages/core/package.json");
  await put("packages/core/src/new.ts", "export const added = true;\n");
  await put("pnpm.cjs", "process.exit(1);\n");
  const original = process.env.npm_execpath;
  process.env.npm_execpath = path.join(root, "pnpm.cjs");
  try {
    await assert.rejects(versionPackages({ root, since: "release-1" }), /Lockfile update failed/u);
  } finally {
    if (original === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = original;
  }
  assert.deepEqual(await read("packages/core/package.json"), before);
  assert.equal(await readFile(path.join(root, "packages", "core", "src", "new.ts"), "utf8"), "export const added = true;\n");
}));

test("the release command commits source and versions, tags them and preserves unrelated staging", () => fixture(async ({ root, put, read, publish }) => {
  await put("notes.md", "previous notes\n");
  publish();
  await put("notes.md", "unrelated staged notes\n");
  execFileSync("git", ["add", "notes.md"], { cwd: root });
  await put("packages/creator/src/new.ts", "export const added = true;\n");
  const preview = await versionAndTagPackages({ root, dryRun: true });
  assert.equal(preview.tag, undefined);
  assert.equal((await read("packages/creator/package.json")).version, "0.0.1");

  const result = await versionAndTagPackages({ root, updateLockfile: false });
  assert.match(result.tag, /^release-\d{8}T\d{6}Z-[a-f\d]{8}$/u);
  const tagged = file => execFileSync("git", ["show", `${result.tag}:${file}`], { cwd: root, encoding: "utf8" });
  assert.equal(JSON.parse(tagged("packages/creator/package.json")).version, "0.0.2");
  assert.equal(tagged("packages/creator/src/new.ts"), "export const added = true;\n");
  assert.equal(tagged("notes.md"), "previous notes\n");
  assert.equal(execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: root, encoding: "utf8" }).trim(), "notes.md");
  const pending = await versionAndTagPackages({ root, updateLockfile: false });
  assert.equal(pending.tag, result.tag);
  assert.equal(pending.releases[0].to, "0.0.2");
  assert.equal(execFileSync("git", ["tag", "--list", "release-*"], { cwd: root, encoding: "utf8" }).trim().split("\n").length, 2);
}));

test("the first release stays unpublished until npm records it, with source metadata surviving prepack", () => fixture(async ({ root, put, read, recordPublished }) => {
  const { tag, releases } = await versionAndTagPackages({ root, updateLockfile: false });
  assert.equal(releases.length, 6);
  assert.ok(tag);
  const pending = await versionAndTagPackages({ root, updateLockfile: false });
  assert.equal(pending.tag, tag);
  assert.equal(pending.releases.length, 6);
  await put("releases/compatibility.json", JSON.stringify({ schemaVersion: 1, releases: [] }));
  const fingerprint = (await read("packages/creator/package.json")).agentUISource;
  await syncPackageReleaseMetadata("creator", root);
  assert.deepEqual((await read("packages/creator/package.json")).agentUISource, fingerprint);
  recordPublished();
  assert.deepEqual(await versionAndTagPackages({ root, updateLockfile: false }), { releases: [] });
}));

test("pushing a prepared tag without publishing reuses its version until npm confirms publication", () => fixture(async ({ root, put, read, publish, recordPublished, registry }) => {
  publish();
  const publishedVersion = registry.get(name("creator")).version;
  await put("packages/creator/src/new.ts", "export const change = 1;\n");
  const first = await versionAndTagPackages({ root, updateLockfile: false });
  await put("packages/creator/src/new.ts", "export const change = 2;\n");
  const second = await versionAndTagPackages({ root, updateLockfile: false });
  assert.notEqual(second.commit, first.commit);
  assert.equal((await read("packages/creator/package.json")).version, "0.0.2");
  assert.equal(second.releases[0].from, publishedVersion);
  assert.equal(registry.get(name("creator")).version, "0.0.1");
  recordPublished(["creator"]);
  // This publication has no gitHead: the bundled fingerprint still identifies it.
  delete registry.get(name("creator")).gitHead;
  assert.deepEqual(await versionAndTagPackages({ root, updateLockfile: false }), { releases: [] });
  await put("packages/creator/src/new.ts", "export const change = 3;\n");
  const next = await versionPackages({ root, dryRun: true });
  assert.equal(next[0].from, "0.0.2");
  assert.equal(next[0].to, "0.0.3");
}));

test("partially published cycles retain the remaining versions without bumping published packages again", () => fixture(async ({ root, put, read, publish, recordPublished }) => {
  await put("packages/plugins/resources/registry/items/integration/bridge/item.json", JSON.stringify({ packages: { [name("runtime")]: "0.0.1", [name("web-component")]: "0.0.1" } }));
  publish();
  await put("packages/core/src/new.ts", "export const changed = true;\n");
  await versionAndTagPackages({ root, updateLockfile: false });
  recordPublished(["core", "plugins"]);
  const pending = await versionPackages({ root, updateLockfile: false });
  assert.deepEqual(new Set(pending.map(release => release.name)), new Set(["runtime", "web-component", "creator"].map(name)));
  assert.ok(pending.every(release => release.to === "0.0.2"));
  assert.equal((await read("packages/plugins/package.json")).version, "0.0.2");
}));

test("npm lookup failures and missing legacy source evidence stop before editing files", () => fixture(async ({ root, put, read, publish, registry }) => {
  publish();
  const original = await read("packages/creator/package.json");
  await put("packages/creator/src/new.ts", "export const changed = true;\n");
  await assert.rejects(versionAndTagPackages({ root, readPublished: async () => { throw new Error("registry unavailable"); } }), /registry unavailable/u);
  assert.deepEqual(await read("packages/creator/package.json"), original);
  delete registry.get(name("creator")).gitHead;
  await assert.rejects(versionPackages({ root }), /use --since/u);
  assert.deepEqual(await read("packages/creator/package.json"), original);
  assert.equal((await versionPackages({ root, since: "release-1", dryRun: true }))[0].to, "0.0.2");
}));

test("real pnpm metadata lookup respects scoped npmrc, published versions and registry errors", () => fixture(async ({ root, put }) => {
  const server = createServer((request, response) => {
    const requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname).slice(1);
    response.setHeader("Content-Type", "application/json");
    if (requested === "@example/missing") { response.writeHead(404).end('{"error":"not_found"}'); return; }
    if (requested === "@example/denied") { response.writeHead(401).end('{"error":"unauthorized"}'); return; }
    const metadata = version => ({ name: requested, version, agentUISource: { sha256: "a".repeat(64), dependencies: {} } });
    response.end(JSON.stringify({ name: requested, "dist-tags": { latest: "1.0.0" }, versions: { "1.0.0": metadata("1.0.0"), "1.1.0": metadata("1.1.0") } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await put(".npmrc", `@example:registry=http://127.0.0.1:${server.address().port}/\n`);
    const metadata = await readPublishedPackage({ root, name: "@example/test" });
    assert.equal(metadata.version, "1.1.0");
    assert.equal(metadata.agentUISource.sha256, "a".repeat(64));
    assert.equal(await readPublishedPackage({ root, name: "@example/missing" }), undefined);
    await assert.rejects(readPublishedPackage({ root, name: "@example/denied" }), /E401/u);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}));
