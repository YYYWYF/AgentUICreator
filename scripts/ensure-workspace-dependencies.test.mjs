import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureWorkspaceDependencies } from "./ensure-workspace-dependencies.mjs";

function installViteEntries(root) {
  for (const project of ["apps/creator-workbench", "examples/creator-host-sandbox", "examples/creator-assistant-host", "examples/creator-embedded-host", "examples/web-component-vue3"]) {
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
test("unsupported Node releases stop before dependency installation", () => fixture(root => {
  for (const nodeVersion of ["20.20.2", "21.7.0", "22.0.0-rc.1", "24.0.0", "24.20.0", "24.21.9", "24.22.0", "24.22.1-rc.1", "25.9.0", "26.12.1", "invalid"]) {
    assert.throws(() => ensureWorkspaceDependencies({ root, nodeVersion, run: () => { throw new Error("must not install"); } }), /Creator requires Node.js 22\.x/);
  }
}));
test("supported stable Node 22.x and 24.x versions use the frozen install", () => fixture(root => {
  for (const nodeVersion of ["22.0.0", "22.23.4", "24.22.1", "24.22.2", "24.23.0"]) {
    ensureWorkspaceDependencies({ root, nodeVersion, run: args => {
      assert.equal(args[0], "install");
      assert.equal(args[1], "--frozen-lockfile");
      installViteEntries(root);
      return { status: 0 };
    } });
  }
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
  assert.throws(() => readFileSync(receipt), /ENOENT/, "failed installs invalidate the old receipt");
}));
test("a second unchanged launch skips installation", () => fixture(root => {
  let installs = 0;
  const options = { root, platform: "win32", architecture: "x64", nodeAbi: "test", run: args => {
    installs++;
    assert.deepEqual(args, ["install", "--frozen-lockfile"]);
    installViteEntries(root);
    return { status: 0 };
  } };
  ensureWorkspaceDependencies(options);
  ensureWorkspaceDependencies(options);
  assert.equal(installs, 1);
}));
test("lockfile, dependency declarations, workspace configuration and installed state invalidate reuse", () => fixture(root => {
  let installs = 0;
  const options = { root, run: () => { installs++; installViteEntries(root); return { status: 0 }; } };
  ensureWorkspaceDependencies(options);
  const put = (file, text) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
  for (const [file, text] of [
    ["pnpm-lock.yaml", "lockfileVersion: '6.0'\n# changed"],
    ["packages/core/package.json", JSON.stringify({ name: "core", dependencies: {} })],
    ["pnpm-workspace.yaml", "packages: ['packages/*']"],
    [".npmrc", "registry=https://example.invalid"],
    ["node_modules/.modules.yaml", "changed installed state"],
  ]) {
    put(file, text);
    const before = installs;
    ensureWorkspaceDependencies(options);
    assert.equal(installs, before + 1, file);
    ensureWorkspaceDependencies(options);
    assert.equal(installs, before + 1, `${file}: second launch`);
  }
}));
test("ordinary scripts and generated release metadata do not require installation", () => fixture(root => {
  let installs = 0;
  const options = { root, run: () => { installs++; installViteEntries(root); return { status: 0 }; } };
  ensureWorkspaceDependencies(options);
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  pkg.scripts = { dev: "changed command" };
  pkg.agentUI = { compatibility: "generated" };
  writeFileSync(path.join(root, "package.json"), JSON.stringify(pkg));
  ensureWorkspaceDependencies(options);
  assert.equal(installs, 1);
}));
test("a deleted direct dependency link is repaired before it can be reused", () => fixture(root => {
  const manifest = path.join(root, "package.json");
  writeFileSync(manifest, JSON.stringify({ packageManager: "pnpm@8.12.0", devDependencies: { compiler: "1.0.0" } }));
  const installed = path.join(root, "node_modules/compiler/package.json");
  let installs = 0;
  const options = { root, run: args => {
    installs++;
    if (installs === 2) assert(args.includes("--force"));
    installViteEntries(root);
    mkdirSync(path.dirname(installed), { recursive: true });
    writeFileSync(installed, "{}");
    return { status: 0 };
  } };
  ensureWorkspaceDependencies(options);
  rmSync(installed);
  ensureWorkspaceDependencies(options);
  ensureWorkspaceDependencies(options);
  assert.equal(installs, 2);
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
test("a lockfile edited during install is never recorded as successfully installed", () => fixture(root => {
  assert.throws(() => ensureWorkspaceDependencies({ root, run: () => {
    installViteEntries(root);
    writeFileSync(path.join(root, "pnpm-lock.yaml"), "changed during install");
    return { status: 0 };
  } }), /inputs changed during installation/);
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
