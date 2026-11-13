import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { beginPackageBuild, recordPackageBuild, checkPackageBuild, logicalRelativePath } from "./package-build-integrity.mjs";
import { syncPackageReleaseMetadata } from "./sync-package-release-metadata.mjs";
import { spawnPnpmSync } from "./pnpm-process.mjs";

const repository = fileURLToPath(new URL("..", import.meta.url));
const modules = ["core", "renderer", "runtime", "plugins", "creator", "web-component"];
const template = "resources/registry/items/foundation/core/item.json";
async function fixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), "agent-ui publish 中文 space-"));
  const put = async (file, value) => {
    const target = path.join(root, ...file.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, typeof value === "string" ? value : JSON.stringify(value));
  };
  const read = async file => JSON.parse(await readFile(path.join(root, ...file.split("/")), "utf8"));
  const versions = { core: "1.2.3", renderer: "2.0.1", runtime: "3.1.4", plugins: "0.0.6", creator: "0.2.5", "web-component": "4.0.2" };
  async function emit(id) {
    const pkg = await read(`packages/${id}/package.json`);
    await put(`packages/${id}/dist/index.js`, `export const version = ${JSON.stringify(pkg.version)};\n`);
    await syncPackageReleaseMetadata(id, root);
    if (id === "plugins") {
      await put("packages/plugins/dist/catalog.json", { schemaVersion: 1, package: { name: pkg.name, version: pkg.version } });
      await put(`packages/plugins/dist/${template}`, await read(`packages/plugins/${template}`));
      await put("packages/plugins/dist/resources/registry/registry.json", await read("packages/plugins/resources/registry/registry.json"));
    }
  }
  const build = async id => { await beginPackageBuild(id, root); await emit(id); await recordPackageBuild(id, root); };
  try {
    await put("package.json", { private: true, type: "module", packageManager: "pnpm@8.12.0" });
    await put("releases/compatibility.json", { schemaVersion: 1, releases: [] });
    await put(".npmrc", "auto-install-peers=false\n");
    for (const id of modules) {
      const actual = JSON.parse(await readFile(path.join(repository, "packages", id, "package.json"), "utf8"));
      await put(`packages/${id}/package.json`, { name: actual.name, version: versions[id], type: "module", files: ["dist"], scripts: {
        prepack: actual.scripts.prepack, prepublishOnly: actual.scripts.prepublishOnly,
      }, ...(id === "plugins" ? { dependencies: { "@za38.03/agent-ui-core": "1.2.3" } } : {}) });
      await put(`packages/${id}/src/index.ts`, `export const owner = ${JSON.stringify(id)};\n`);
    }
    await put("packages/plugins/resources/registry/registry.json", { items: [{ id: "foundation/core", path: "items/foundation/core/item.json" }] });
    await put(`packages/plugins/${template}`, { id: "foundation/core", packages: { "@za38.03/agent-ui-core": versions.core, "@za38.03/agent-ui-plugins": versions.plugins } });
    for (const file of ["package-build-integrity.mjs", "sync-package-release-metadata.mjs", "public-package-types.mjs"]) {
      await mkdir(path.join(root, "scripts"), { recursive: true });
      await copyFile(path.join(repository, "scripts", file), path.join(root, "scripts", file));
    }
    await run({ root, put, read, build, emit });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("independently versioned packages and per-owner template pins pass", () => fixture(async ({ root, build }) => {
  for (const id of modules) { await build(id); await checkPackageBuild(id, root); }
}));

test("missing receipts, failed builds and edits during compilation cannot be published", () => fixture(async ({ root, build, put, emit }) => {
  await assert.rejects(checkPackageBuild("core", root), /Cannot pack\/publish/);
  await build("core");
  await beginPackageBuild("core", root);
  await assert.rejects(checkPackageBuild("core", root), /ENOENT/);
  await put("packages/core/src/index.ts", "export const changedDuringBuild = true;\n");
  await emit("core");
  await assert.rejects(recordPackageBuild("core", root), /inputs changed during compilation/);
  await assert.rejects(checkPackageBuild("core", root), /ENOENT/);
}));

test("version/source/dependency changes require a rebuild, including same-version edits", () => fixture(async ({ root, build, put, read }) => {
  await build("plugins");
  const pkg = await read("packages/plugins/package.json");
  await put("packages/plugins/package.json", { ...pkg, version: "0.0.7" });
  await assert.rejects(checkPackageBuild("plugins", root), /identity differs/);
  await put("packages/plugins/package.json", pkg);
  await put("packages/plugins/src/new-file.ts", "export const added = true;\n");
  await assert.rejects(checkPackageBuild("plugins", root), /Stale build inputs.*new-file.ts/);
  await build("plugins");
  await put("packages/core/src/index.ts", "export const changedDependency = true;\n");
  await assert.rejects(checkPackageBuild("plugins", root), /Stale build inputs.*packages\/core/);
}));

test("tampered, deleted and unexpected dist files are rejected", () => fixture(async ({ root, build, put }) => {
  await build("core");
  await put("packages/core/dist/index.js", "old code\n");
  await assert.rejects(checkPackageBuild("core", root), /Changed or missing build output.*index.js/);
  await build("core");
  await rm(path.join(root, "packages/core/dist/index.js"));
  await assert.rejects(checkPackageBuild("core", root), /Changed or missing build output.*index.js/);
  await build("core");
  await put("packages/core/dist/obsolete.js", "unexpected old artifact\n");
  await assert.rejects(checkPackageBuild("core", root), /Changed or missing build output.*obsolete.js/);
}));

test("stale catalog, built template and authored pins fail before a receipt is issued", () => fixture(async ({ root, build, emit, put, read }) => {
  await beginPackageBuild("plugins", root); await emit("plugins");
  await put("packages/plugins/dist/catalog.json", { package: { name: "@za38.03/agent-ui-plugins", version: "0.0.5" } });
  await assert.rejects(recordPackageBuild("plugins", root), /Stale Plugins catalog/);
  await emit("plugins");
  const item = await read(`packages/plugins/${template}`);
  await put(`packages/plugins/dist/${template}`, { ...item, packages: { ...item.packages, "@za38.03/agent-ui-plugins": "0.0.5" } });
  await assert.rejects(recordPackageBuild("plugins", root), /Stale built template/);
  await put(`packages/plugins/${template}`, { ...item, packages: { ...item.packages, "@za38.03/agent-ui-core": "1.2.2" } });
  await assert.rejects(build("plugins"), /Stale template requirement.*core requires 1.2.2, package is 1.2.3/);
}));

test("native Windows paths become portable receipt keys", () => {
  for (const root of ["C:\\build 中文 space", "\\\\server\\share\\build 中文 space"]) {
    const file = path.win32.join(root, "packages", "plugins", "dist", "theme", "theme-contract.d.ts");
    assert.equal(logicalRelativePath(root, file, path.win32), "packages/plugins/dist/theme/theme-contract.d.ts");
  }
});

test("all public build/pack/publish hooks include the gate; independent verifier cannot skip it", async () => {
  for (const id of modules) {
    const pkg = JSON.parse(await readFile(path.join(repository, "packages", id, "package.json"), "utf8"));
    assert.ok(pkg.scripts.build.startsWith(`node ../../scripts/package-build-integrity.mjs begin ${id} && `));
    assert.ok(pkg.scripts.build.endsWith(` && node ../../scripts/package-build-integrity.mjs record ${id}`));
    for (const hook of ["prepack", "prepublishOnly"]) assert.ok(pkg.scripts[hook].startsWith(`node ../../scripts/package-build-integrity.mjs check ${id}`));
  }
  assert.match(await readFile(path.join(repository, "scripts/verify-public-packages.mjs"), "utf8"), /await checkPackageBuild\(id, root\)/);
});

test("real pnpm pack blocks a 0.0.7 package with 0.0.6 artifacts and succeeds after rebuilding", () => fixture(async ({ root, build, put, read }) => {
  await build("plugins");
  const pkg = await read("packages/plugins/package.json");
  await put("packages/plugins/package.json", { ...pkg, version: "0.0.7" });
  const item = await read(`packages/plugins/${template}`);
  await put(`packages/plugins/${template}`, { ...item, packages: { ...item.packages, [pkg.name]: "0.0.7" } });
  const pack = () => spawnPnpmSync(["pack", "--pack-destination", path.join(root, "packed")], {
    cwd: path.join(root, "packages/plugins"), encoding: "utf8", timeout: 30_000,
    env: { ...process.env, npm_config_ignore_scripts: "false" },
  });
  const rejected = pack();
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stdout + rejected.stderr, /Cannot pack\/publish.*plugins/);
  const publishGate = spawnPnpmSync(["run", "prepublishOnly"], { cwd: path.join(root, "packages/plugins"), encoding: "utf8", timeout: 30_000 });
  assert.notEqual(publishGate.status, 0);
  assert.match(publishGate.stdout + publishGate.stderr, /Cannot pack\/publish.*plugins/);
  assert.deepEqual(await readdir(path.join(root, "packed")).catch(error => { if (error.code === "ENOENT") return []; throw error; }), []);
  await build("plugins");
  const accepted = pack();
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
  const [filename] = (await readdir(path.join(root, "packed"))).filter(file => file.endsWith(".tgz"));
  const archive = gunzipSync(await readFile(path.join(root, "packed", filename)));
  const files = new Map();
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const string = (start, end) => header.subarray(start, end).toString().split("\0")[0];
    const size = parseInt(string(124, 136).trim(), 8) || 0;
    const name = [string(345, 500), string(0, 100)].filter(Boolean).join("/");
    files.set(name, archive.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  assert.equal(JSON.parse(files.get("package/package.json")).version, "0.0.7");
  assert.equal(JSON.parse(files.get("package/dist/catalog.json")).package.version, "0.0.7");
  assert.deepEqual(JSON.parse(files.get(`package/dist/${template}`)).packages, { "@za38.03/agent-ui-core": "1.2.3", "@za38.03/agent-ui-plugins": "0.0.7" });
  // Repeated prepack metadata generation must not make a correct receipt stale.
  await checkPackageBuild("plugins", root);
  const defaultDestination = spawnPnpmSync(["pack"], { cwd: path.join(root, "packages/plugins"), encoding: "utf8", timeout: 30_000,
    env: { ...process.env, npm_config_ignore_scripts: "false" } });
  assert.equal(defaultDestination.status, 0, defaultDestination.stdout + defaultDestination.stderr);
  // The tarball created beside package.json is an output, not a source change.
  await checkPackageBuild("plugins", root);
}));
