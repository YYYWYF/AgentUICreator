import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureWorkspaceDependencies } from "./ensure-workspace-dependencies.mjs";

function installViteEntries(root) {
  for (const project of ["apps/creator-workbench", "examples/creator-host-sandbox"]) {
    const directory = path.join(root, project, "node_modules/vite/bin");
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "vite.js"), "");
  }
}
function fixture(work) {
  const root = mkdtempSync(path.join(os.tmpdir(), "Agent UI source copy "));
  try {
    writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '6.0'\n");
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ packageManager: "pnpm@8.12.0" }));
    work(root);
  }
  finally { rmSync(root, { recursive: true, force: true }); }
}
test("Node 20.19 meets the minimum; older unsupported releases stop before installation", () => fixture(root => {
  for (const nodeVersion of ["20.0.0", "20.18.3", "21.7.3", "22.0.0", "22.11.0"]) {
    assert.throws(() => ensureWorkspaceDependencies({ root, nodeVersion, run: () => { throw new Error("must not install"); } }), /Creator requires Node.js/);
  }
  ensureWorkspaceDependencies({ root, nodeVersion: "20.19.0", run: () => { installViteEntries(root); return { status: 0 }; } });
}));
test("a source-only copy installs the frozen graph before workspace preparation", () => fixture(root => {
  ensureWorkspaceDependencies({ root, platform: "win32", architecture: "x64", nodeAbi: "test", run: (args, options) => {
    assert.deepEqual(args, ["install", "--frozen-lockfile"]);
    assert.equal(options.cwd, root);
    installViteEntries(root);
    return { status: 0 };
  } });
  assert.equal(JSON.parse(readFileSync(path.join(root, "node_modules/.agent-ui-platform.json"))).platform, "win32");
}));
test("copied macOS modules are rebuilt on Windows, and failed installs never mark them ready", () => fixture(root => {
  mkdirSync(path.join(root, "node_modules"));
  const receipt = path.join(root, "node_modules/.agent-ui-platform.json");
  writeFileSync(receipt, JSON.stringify({ platform: "darwin", architecture: "arm64", nodeAbi: "test" }));
  assert.throws(() => ensureWorkspaceDependencies({ root, platform: "win32", architecture: "x64", nodeAbi: "test", run: args => {
    assert.deepEqual(args, ["install", "--frozen-lockfile", "--force"]);
    return { status: 1 };
  } }), /Dependency installation failed/);
  assert.equal(JSON.parse(readFileSync(receipt)).platform, "darwin");
}));
test("a second launch still verifies the lockfile without forcing another platform rebuild", () => fixture(root => {
  const options = { root, platform: "win32", architecture: "x64", nodeAbi: "test", run: args => {
    assert.deepEqual(args, ["install", "--frozen-lockfile"]);
    installViteEntries(root);
    return { status: 0 };
  } };
  ensureWorkspaceDependencies(options);
  ensureWorkspaceDependencies(options);
}));
test("a missing Vite entry forces repair even with a matching platform receipt", () => fixture(root => {
  mkdirSync(path.join(root, "node_modules"));
  writeFileSync(path.join(root, "node_modules/.agent-ui-platform.json"), JSON.stringify({ platform: "win32", architecture: "x64", nodeAbi: "test", packageManager: "pnpm@8.12.0" }));
  ensureWorkspaceDependencies({ root, platform: "win32", architecture: "x64", nodeAbi: "test", run: args => {
    assert.deepEqual(args, ["install", "--frozen-lockfile", "--force"]);
    installViteEntries(root);
    return { status: 0 };
  } });
}));
test("an install reporting success without Vite stops before starting either server", () => fixture(root => {
  assert.throws(() => ensureWorkspaceDependencies({ root, run: () => ({ status: 0 }) }), /Vite installation is incomplete/);
  assert.throws(() => readFileSync(path.join(root, "node_modules/.agent-ui-platform.json")), /ENOENT/);
}));
test("modules installed by a different pnpm version are rebuilt before launch", () => fixture(root => {
  installViteEntries(root);
  mkdirSync(path.join(root, "node_modules"));
  const receipt = path.join(root, "node_modules/.agent-ui-platform.json");
  writeFileSync(receipt, JSON.stringify({ platform: "win32", architecture: "x64", nodeAbi: "test", packageManager: "pnpm@10.34.7" }));
  ensureWorkspaceDependencies({ root, platform: "win32", architecture: "x64", nodeAbi: "test", run: args => {
    assert.deepEqual(args, ["install", "--frozen-lockfile", "--force"]);
    return { status: 0 };
  } });
  assert.equal(JSON.parse(readFileSync(receipt)).packageManager, "pnpm@8.12.0");
}));
