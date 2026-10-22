import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkDependencyPins } from "./check-dependency-pins.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "dependency-pins-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  async function write(relative, value) {
    const file = path.join(root, ...relative.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, typeof value === "string" ? value : JSON.stringify(value));
  }
  for (const directory of ["packages", "apps", "examples", "scripts", "website"]) await mkdir(path.join(root, directory));
  await write("package.json", { packageManager: "pnpm@8.12.0", dependencies: { react: "19.1.1" } });
  await write("packages/plugins/package.json", { peerDependencies: { react: ">=18 <20", "react-dom": ">=18 <20" } });
  await write("packages/creator/python/pyproject.toml", '[build-system]\nrequires = ["hatchling==1.29.0"]\n[project]\ndependencies = ["anyio==4.14.2"]\n');
  await write("packages/creator/python/requirements.lock", "anyio==4.14.2\r\n");
  return { root, write };
}

test("accepts exact versions, scoped aliases and workspace links while retaining compatibility ranges", async t => {
  const { root, write } = await fixture(t);
  await write("packages/example/package.json", {
    dependencies: { core: "workspace:*", audit: "npm:@scope/compiler@1.2.3", lib: "1.2.3-beta.1" },
    peerDependencies: { react: ">=18 <20" }, engines: { node: ">=20" },
  });
  await checkDependencyPins(root);
});

test("rejects floating overrides, fixtures and current registry requirements", async t => {
  const { root, write } = await fixture(t);
  await write("package.json", { packageManager: "pnpm@8.12.0", pnpm: { overrides: { rolldown: "~1.2.8" } } });
  await write("packages/creator/operator/tests/fixtures/project/package.json", { devDependencies: { vite: "^8.3.0" } });
  await write("packages/plugins/resources/registry/items/plugin/example/item.json", { packages: { react: "latest" } });
  await write("website/package.json", { devDependencies: { '@rspress/core': '^2.0.23' } });
  await assert.rejects(checkDependencyPins(root), error => {
    for (const fragment of ["rolldown=~1.2.8", "vite=^8.3.0", "react=latest", "@rspress/core=^2.0.23"]) assert.ok(error.message.includes(fragment));
    return true;
  });
});

test("preserves immutable releases and upstream manifests without hiding current plugin requirements", async t => {
  const { root, write } = await fixture(t);
  await write("packages/plugins/resources/history/releases/old/item.json", { packages: { react: "^18" } });
  await write("packages/plugins/src/shared/upstream/reference/package.json", { dependencies: { react: "^18" } });
  await checkDependencyPins(root);
  await write("packages/plugins/resources/registry/items/plugin/example/item.json", { packages: { react: "*" } });
  await assert.rejects(checkDependencyPins(root), /react=\*/u);
});

test("rejects unpinned Python dependencies and package managers", async t => {
  const { root, write } = await fixture(t);
  await write("package.json", { packageManager: "pnpm@latest" });
  await write("packages/creator/python/pyproject.toml", '[project]\ndependencies = ["anyio>=4"]\n');
  await write("packages/creator/python/requirements.lock", "anyio>=4\r\npytest==9.*\r\n");
  await assert.rejects(checkDependencyPins(root), error => {
    for (const fragment of ["packageManager", "pyproject.toml: anyio>=4", "requirements.lock: anyio>=4", "requirements.lock: pytest==9.*"]) assert.ok(error.message.includes(fragment));
    return true;
  });
});

test("resource React requirements use the production peer range without allowing floating install dependencies", async t => {
  const { root, write } = await fixture(t);
  await write("packages/plugins/resources/registry/items/plugin/example/item.json", { packages: { react: ">=18 <20", "react-dom": ">=18 <20" } });
  await checkDependencyPins(root);
  await write("packages/plugins/resources/registry/items/plugin/example/item.json", { packages: { react: "*" } });
  await assert.rejects(checkDependencyPins(root), /react=\*/u);
  await write("packages/plugins/resources/registry/items/plugin/example/item.json", { packages: { react: ">=18 <20" } });
  await write("website/package.json", { devDependencies: { react: ">=18 <20" } });
  await assert.rejects(checkDependencyPins(root), /react=>=18 <20/u);
});
