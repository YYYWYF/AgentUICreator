import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { hostPackages, isDevelopmentInput, prepareWorkspacePackages, prepareWorkspacePackagesAsync } from "./workspace-build-cache.mjs";

const packages = [...hostPackages, "creator"];
function fixture(work) {
  const root = mkdtempSync(path.join(tmpdir(), "Agent UI build 中文 space "));
  const put = (file, text = "value") => {
    const target = path.join(root, ...file.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  const deps = { core: [], renderer: [], plugins: ["core", "renderer", "runtime"], runtime: ["core", "renderer"], creator: ["core", "runtime", "plugins", "renderer"] };
  for (const name of packages) {
    put(`packages/${name}/package.json`, JSON.stringify({ name: `@za38.03/agent-ui-${name}`, dependencies: Object.fromEntries(deps[name].map(dep => [`@za38.03/agent-ui-${dep}`, "workspace:*"])) }));
    put(`packages/${name}/src/index.ts`, "export const value = 1;");
  }
  put("packages/plugins/source-layout.json", JSON.stringify({ files: [{ view: "resources/registry/items/plugin/copy/files/generated.ts" }] }));
  const calls = [];
  const emit = name => { put(`packages/${name}/dist/index.js`); if (name === "creator") { put("packages/creator/dist/cli.js"); put("packages/creator/operator/dist/runtime/operator-runtime.mjs"); } };
  const run = args => { const name = args[1].replace("@za38.03/agent-ui-", ""); calls.push(name); emit(name); return { status: 0 }; };
  const build = options => prepareWorkspacePackages(packages, { root, run, ...options });
  const context = { root, put, calls, emit, run, build };
  return Promise.resolve().then(() => work(context)).finally(() => rmSync(root, { recursive: true, force: true }));
}

test("persists content and output receipts across independent invocations", () => fixture(({ root, build, calls }) => {
  build();
  assert.deepEqual(calls, packages);
  calls.length = 0;
  build();
  assert.deepEqual(calls, []);
  assert(JSON.parse(readFileSync(path.join(root, "node_modules/.cache/agent-ui-build/creator.json"))).output);
}));
test("rebuilds only the changed package and its actual transitive consumers", () => fixture(({ build, calls, put }) => {
  build(); calls.length = 0;
  put("packages/core/src/new.ts", "new source");
  build();
  assert.deepEqual(calls, ["core", "runtime", "plugins", "creator"], "independent Renderer is reusable");
  calls.length = 0;
  put("packages/runtime/src/index.ts", "changed runtime");
  build();
  assert.deepEqual(calls, ["runtime", "plugins", "creator"]);
  calls.length = 0;
  put("packages/creator/browser/dock-client.ts", "changed dock");
  build();
  assert.deepEqual(calls, ["creator"]);
}));
test("deleted/modified outputs, Operator outputs and damaged receipts cannot be reused", () => fixture(({ root, build, calls, put }) => {
  build();
  for (const [file, expected] of [
    ["packages/plugins/dist/index.js", "plugins"],
    ["packages/creator/operator/dist/runtime/operator-runtime.mjs", "creator"],
    ["node_modules/.cache/agent-ui-build/runtime.json", "runtime"],
  ]) {
    rmSync(path.join(root, ...file.split("/"))); calls.length = 0;
    build(); assert.deepEqual(calls, [expected]);
  }
  put("packages/core/dist/index.js", "modified output"); calls.length = 0;
  build(); assert.deepEqual(calls, ["core"]);
  put("node_modules/.cache/agent-ui-build/plugins.json", "{interrupted"); calls.length = 0;
  build(); assert.deepEqual(calls, ["plugins"]);
}));
test("tracks config, resources and shared build inputs but ignores tests and generated views", () => fixture(({ build, calls, put }) => {
  build(); calls.length = 0;
  for (const file of ["packages/plugins/tests/demo.ts", "packages/plugins/src/demo.test.ts", "packages/plugins/src/internal/vendor-generated/assistant-ui/view.ts", "packages/plugins/resources/registry/items/plugin/copy/files/generated.ts"]) put(file);
  build(); assert.deepEqual(calls, []);
  put("packages/plugins/tsconfig.build.json", "{}");
  build(); assert.deepEqual(calls, ["plugins", "creator"]);
  calls.length = 0;
  put("scripts/sync-package-release-metadata.mjs", "new build script");
  build(); assert.deepEqual(calls, packages);
}));
test("failed builds invalidate success and do not start downstream builds", () => fixture(({ root, build, calls, put, run }) => {
  build(); calls.length = 0;
  put("packages/core/src/index.ts", "bad source");
  assert.throws(() => build({ run: args => { if (args[1].endsWith("-core")) return { status: 1 }; return run(args); } }), /preparation failed/);
  assert.throws(() => readFileSync(path.join(root, "node_modules/.cache/agent-ui-build/core.json")), /ENOENT/);
  assert.deepEqual(calls, []);
  build(); assert.deepEqual(calls, ["core", "runtime", "plugins", "creator"]);
}));
test("tracks shared Plugin build helpers, shipped notices and install configuration", () => fixture(({ build, calls, put }) => {
  build();
  for (const file of ["scripts/finalize-esm-imports.mjs", "packages/creator/operator/src/project/generated-code-format.mjs", "packages/plugins/THIRD_PARTY_NOTICES.md"]) {
    calls.length = 0;
    put(file, "changed build input");
    build();
    assert.deepEqual(calls, ["plugins", "creator"], file);
  }
  calls.length = 0;
  put(".npmrc", "registry=https://example.invalid");
  build();
  assert.deepEqual(calls, packages);
}));
test("an incomplete successful process is not cached, and explicit force still builds all packages", () => fixture(({ build, calls }) => {
  assert.throws(() => build({ run: () => ({ status: 0 }) }), /output is incomplete/);
  build(); calls.length = 0;
  build({ force: true });
  assert.deepEqual(calls, packages);
}));
test("a save during an async build remains invalid, and cancellation writes no receipt", () => fixture(async ({ root, build, put, calls, emit }) => {
  build(); calls.length = 0;
  put("packages/creator/src/index.ts", "save before build");
  await prepareWorkspacePackagesAsync(packages, async name => {
    emit(name); put("packages/creator/src/index.ts", "save during build"); return true;
  }, { root });
  build(); assert.deepEqual(calls, ["creator"]);
  put("packages/creator/src/index.ts", "another save");
  await prepareWorkspacePackagesAsync(packages, async () => false, { root });
  assert.throws(() => readFileSync(path.join(root, "node_modules/.cache/agent-ui-build/creator.json")), /ENOENT/);
}));
test("logical Windows paths exclude generated output and tests", () => {
  for (const file of ["operator\\dist\\runtime.mjs", "src\\internal\\vendor-generated\\assistant-ui\\index.ts", "tests\\index.ts"]) assert.equal(isDevelopmentInput(file), false);
  assert.equal(isDevelopmentInput("operator\\src\\bootstrap\\index.ts"), true);
});
