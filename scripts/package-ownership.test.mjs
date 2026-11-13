import assert from "node:assert/strict";
import { readFile, access, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publicModules } from "./build-public-packages.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = async name => JSON.parse(await readFile(path.join(root, "packages", name, "package.json"), "utf8"));
test("Creator publishes Agent and Operator as one development package", async () => {
  assert.equal(publicModules.length, 6);
  assert(!publicModules.includes("operator"));
  const creator = await manifest("creator");
  assert(!creator.dependencies[creator.name]);
  assert(!Object.keys(creator.optionalDependencies ?? {}).some(name => name.startsWith(creator.name + "-")));
  for (const entry of [".", "./project", "./project/dev", "./project/protocol", "./project/host", "./project/updates", "./project/resources", "./project/commands", "./bootstrap", "./source-registry", "./mock-agent"]) assert(creator.exports[entry], entry);
  await access(path.join(root, "packages/creator/src/agent/server.ts"));
  await access(path.join(root, "packages/creator/operator/src/handler.ts"));
  await access(path.join(root, "packages/creator/contracts/creator/operator.schema.json"));
  await assert.rejects(access(path.join(root, "packages/operator/package.json")), { code: "ENOENT" });
  for (const name of publicModules.filter(name => name !== "creator")) {
    const pkg = await manifest(name);
    for (const dependency of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies })) assert(!/agent-ui-(?:creator(?:-[^/]+)?|operator)(?:\/|$)/u.test(dependency), `${name}: ${dependency}`);
  }
});
test("public entries use portable logical paths and exist in built packages", async () => {
  for (const name of publicModules) {
    const pkg = await manifest(name);
    assert.equal(pkg.name, `@za38.03/agent-ui-${name}`);
    for (const target of Object.values(pkg.exports)) for (const file of typeof target === "string" ? [target] : Object.values(target)) {
      assert(!file.includes("\\"), file);
      await access(path.join(root, "packages", name, file.includes("*") ? file.slice(0, file.indexOf("*")) : file));
    }
  }
});
import { test } from "node:test";

test("Runtime has no production dependency or implementation import from Plugins", async () => {
  const runtime = await manifest("runtime");
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    assert(!runtime[field]?.["@za38.03/agent-ui-plugins"], field);
  }
  const directory = path.join(root, "packages/runtime/src");
  for (const name of await readdir(directory, { recursive: true })) {
    if (!/\.[jt]sx?$/u.test(name)) continue;
    const source = await readFile(path.join(directory, name), "utf8");
    assert(!/["']@za38\.03\/agent-ui-plugins(?:\/|["'])/u.test(source), name);
  }
});
