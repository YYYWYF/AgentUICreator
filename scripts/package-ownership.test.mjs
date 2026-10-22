import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { publicModules } from "./build-public-packages.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = async name => JSON.parse(await readFile(path.join(root, "packages", name, "package.json"), "utf8"));
test("six independently versioned public packages own Bootstrap and Mock subpaths", async () => {
  const published = [];
  for (const name of await readdir(path.join(root, "packages"))) {
    let pkg;
    try { pkg = await manifest(name); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (!pkg.private) published.push(name);
  }
  assert.deepEqual(published.sort(), [...publicModules].sort());
  const control = await manifest("creator"), creator = await manifest("creator");
  assert(control.exports["./bootstrap"]);
  assert(creator.exports["./mock-agent"]);
  const plugins = await manifest("plugins");
  for (const entry of [".", "./composer", "./styles.css", "./theme", "./lexical", "./generative-ui"]) assert(plugins.exports[entry], entry);
  for (const name of publicModules) {
    const pkg = await manifest(name);
    assert.equal(pkg.name, `@za38.03/agent-ui-${name}`);
    for (const field of ["dependencies", "devDependencies"]) {
      for (const dependency of Object.keys(pkg[field] ?? {})) {
        assert(!/agent-ui-(?:bootstrap|mock-agent)$/u.test(dependency));
        assert(!dependency.endsWith("/bootstrap") && !dependency.endsWith("/mock-agent"));
      }
    }
    for (const target of Object.values(pkg.exports)) for (const file of typeof target === "string" ? [target] : Object.values(target)) {
      assert(!file.includes("\\"), file);
      await access(path.join(root, "packages", name, file.includes("*") ? file.slice(0, file.indexOf("*")) : file));
    }
  }
});
test("Plugins owns source assets; Operator owns Node loading without another registry package", async () => {
  const plugins = await manifest("plugins"), control = await manifest("creator");
  assert(plugins.exports["./catalog.json"]);
  assert(plugins.exports["./catalog"]);
  assert(control.exports["./source-registry"]);
  assert.equal(control.dependencies[plugins.name], "workspace:*");
  assert(!Object.keys(control.dependencies).some(name => name.endsWith("agent-ui-source-registry")));
  const catalog = JSON.parse(await readFile(path.join(root, "packages/plugins/dist/catalog.json"), "utf8"));
  assert.deepEqual(catalog.package, { name: plugins.name, version: plugins.version });
  assert(catalog.plugins.length > 0);
  const bundle = await readFile(path.join(root, "packages/creator/operator/dist/runtime/operator-runtime.mjs"), "utf8");
  assert(bundle.includes("@za38.03/agent-ui-plugins/catalog"));
  for (const folder of ["registry", "fixtures"]) await assert.rejects(access(path.join(root, "packages/creator/operator/dist", folder)), { code: "ENOENT" });
});
test("logical export paths stay portable and bootstrap presets use native file URLs", async () => {
  const source = await readFile(path.join(root, "packages/creator/operator/src/bootstrap/default-presets.ts"), "utf8");
  assert(source.includes('new URL(`../../presets/${mode}/app-ui.json`, import.meta.url)'));
  for (const base of ["C:\\Agent UI 中文", "/Agent UI 中文"]) {
    const pathApi = base.startsWith("C:") ? path.win32 : path.posix;
    const file = pathApi.join(base, "dist", "bootstrap", "index.js");
    assert.equal(pathApi.resolve(pathApi.dirname(file), "../../presets"), pathApi.join(base, "presets"));
  }
  await access(path.join(root, "packages/plugins/dist/theme/theme-contract.d.ts"));
});

test("Creator owns Operator and contracts without standalone workspace or runtime dependency", async () => {
  const creator = await manifest("creator");
  for (const entry of ["./operator", "./operator/dev", "./operator/protocol", "./operator/host", "./operator/updates", "./operator/resources", "./operator/commands", "./bootstrap", "./source-registry"]) assert(creator.exports[entry], entry);
  await assert.rejects(access(path.join(root, "packages/operator/package.json")), { code: "ENOENT" });
  await assert.rejects(access(path.join(root, "packages/creator/operator/package.json")), { code: "ENOENT" });
  await assert.rejects(access(path.join(root, "contracts")), { code: "ENOENT" });
  await access(path.join(root, "packages/creator/contracts/creator/operator.schema.json"));
  for (const name of publicModules.filter(name => name !== "creator")) {
    const pkg = await manifest(name);
    for (const dependency of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies })) assert(!/agent-ui-(?:creator|operator)(?:\/|$)/u.test(dependency), `${name}: ${dependency}`);
  }
  for (const base of ["C:\\开发 空格\\creator", "/开发 空格/creator"]) {
    const native = base.startsWith("C:") ? path.win32 : path.posix;
    const module = native.join(base, "dist", "operator");
    const bootstrap = native.join(module, "dist", "bootstrap", "index.js");
    assert.equal(native.resolve(native.dirname(bootstrap), "../../presets"), native.join(module, "presets"));
    const managedEntry = native.join(base, "project", ".agent-ui", "operator", "entry.mjs");
    assert.equal(native.resolve(native.dirname(managedEntry), "../.."), native.join(base, "project"));
  }
});
