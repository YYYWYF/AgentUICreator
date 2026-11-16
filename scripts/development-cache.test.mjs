import assert from "node:assert/strict";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";
import {
  prepareDevelopmentCache,
  workspaceDevelopmentId,
} from "./development-cache.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
});
function fixture() {
  const root = fs.mkdtempSync(path.join(tmpdir(), "Agent UI 缓存 space "));
  roots.push(root);
  return { root, base: path.join(root, "temporary") };
}
function put(file, value = "old output") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}
const generation = (cacheDir) => path.resolve(cacheDir, "../..");

test("Windows workspace paths cover drive case, spaces, Unicode and UNC", () => {
  assert.equal(
    workspaceDevelopmentId("C:\\公司 Projects\\UI", "win32"),
    workspaceDevelopmentId("c:/公司 Projects/UI/.", "win32"),
  );
  assert.equal(
    workspaceDevelopmentId("\\\\SERVER\\Share\\UI", "win32"),
    workspaceDevelopmentId("\\\\server\\share\\ui", "win32"),
  );
  assert.notEqual(
    workspaceDevelopmentId("C:\\UI", "win32"),
    workspaceDevelopmentId("D:\\UI", "win32"),
  );
});

test("default cache stays inside the project and cleans both services independently", () => {
  const { root } = fixture();
  const realRoot = fs.realpathSync(root);
  const parent = path.join(
    realRoot,
    "node_modules",
    ".cache",
    "agent-ui-development",
    workspaceDevelopmentId(realRoot),
  );
  const outputs = new Map();
  for (const role of ["workbench", "host-preview"]) {
    const cache = prepareDevelopmentCache(realRoot, role);
    assert.equal(path.dirname(generation(cache)), path.join(parent, role));
    const file = path.join(cache, "deps", "probe.js.map");
    put(file);
    outputs.set(role, file);
  }
  const next = prepareDevelopmentCache(realRoot, "workbench");
  assert.equal(fs.existsSync(outputs.get("workbench")), false);
  assert.equal(fs.existsSync(outputs.get("host-preview")), true);
  assert.deepEqual(fs.readdirSync(next), []);
  prepareDevelopmentCache(realRoot, "host-preview");
  assert.equal(fs.existsSync(outputs.get("host-preview")), false);
});

test("Vite writes dependency maps after repeated project-local cold starts", async () => {
  const { root } = fixture();
  const require = createRequire(
    new URL("../apps/creator-workbench/package.json", import.meta.url),
  );
  const { resolveConfig, optimizeDeps } = await import(
    pathToFileURL(require.resolve("vite")).href
  );
  put(
    path.join(root, "package.json"),
    JSON.stringify({ name: "cache-fixture", type: "module" }),
  );
  const dependency = path.join(root, "node_modules", "cache-probe");
  put(
    path.join(dependency, "package.json"),
    JSON.stringify({ name: "cache-probe", main: "index.js" }),
  );
  put(path.join(dependency, "index.js"), "module.exports = { value: 42 };\n");
  const previous = new Map();
  for (let round = 0; round < 2; round++) {
    await Promise.all(["workbench", "host-preview"].map(async role => {
      const cacheDir = prepareDevelopmentCache(root, role);
      const old = previous.get(role);
      if (old) assert.equal(fs.existsSync(old), false);
      const config = await resolveConfig({
        configFile: false,
        root,
        cacheDir,
        logLevel: "silent",
        optimizeDeps: { include: ["cache-probe"], noDiscovery: true },
      }, "serve");
      const metadata = await optimizeDeps(config, true);
      const output = metadata.optimized["cache-probe"].file;
      assert.ok(fs.readFileSync(output, "utf8").includes("42"));
      const map = JSON.parse(fs.readFileSync(`${output}.map`, "utf8"));
      assert.equal(map.version, 3);
      assert.ok(map.sources.length > 0);
      previous.set(role, generation(cacheDir));
    }));
  }
});

test("every startup clears previous Vite output while preserving dependencies and build receipts", () => {
  const options = fixture();
  const legacy = path.join(
    options.root,
    "apps/creator-workbench/node_modules/.vite",
  );
  const dependency = path.join(
    options.root,
    "apps/creator-workbench/node_modules/react/package.json",
  );
  const receipt = path.join(
    options.root,
    "node_modules/.cache/agent-ui-build/creator.json",
  );
  put(path.join(legacy, "deps/react-markdown.js.map"));
  put(dependency, "keep dependency");
  put(receipt, "keep build receipt");
  const first = prepareDevelopmentCache(options.root, "workbench", options);
  put(path.join(first, "deps/react-markdown.js.map"));
  const second = prepareDevelopmentCache(options.root, "workbench", options);
  assert.notEqual(first, second);
  assert.equal(fs.existsSync(generation(first)), false);
  assert.equal(fs.existsSync(legacy), false);
  assert.deepEqual(fs.readdirSync(second), []);
  assert.equal(fs.readFileSync(dependency, "utf8"), "keep dependency");
  assert.equal(fs.readFileSync(receipt, "utf8"), "keep build receipt");
});

test("cache cleanup stays inside its workspace and service", () => {
  const options = fixture();
  const workbench = prepareDevelopmentCache(options.root, "workbench", options);
  const preview = prepareDevelopmentCache(
    options.root,
    "host-preview",
    options,
  );
  put(path.join(workbench, "workbench.js"));
  put(path.join(preview, "preview.js"));
  const other = fixture();
  const external = prepareDevelopmentCache(other.root, "workbench", {
    base: options.base,
  });
  put(path.join(external, "external.js"));
  prepareDevelopmentCache(options.root, "workbench", options);
  assert.equal(fs.existsSync(workbench), false);
  assert.equal(
    fs.readFileSync(path.join(preview, "preview.js"), "utf8"),
    "old output",
  );
  assert.equal(
    fs.readFileSync(path.join(external, "external.js"), "utf8"),
    "old output",
  );
});

test("locked Windows cache files warn and leave the new cache usable", () => {
  for (const code of ["EPERM", "EBUSY", "EACCES"]) {
    const { root } = fixture();
    const first = prepareDevelopmentCache(root, "workbench");
    const old = generation(first);
    put(path.join(first, "react-markdown.js.map"));
    const warnings = [];
    const second = prepareDevelopmentCache(root, "workbench", {
      warn: (message) => warnings.push(message),
      remove(target, settings) {
        if (target === old)
          throw Object.assign(new Error("Access is denied"), { code });
        fs.rmSync(target, settings);
      },
    });
    assert.notEqual(first, second);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes(code));
    assert.ok(fs.existsSync(path.join(first, "react-markdown.js.map")));
    put(path.join(second, "new.js.map"), "new output");
    assert.equal(
      fs.readFileSync(path.join(second, "new.js.map"), "utf8"),
      "new output",
    );
  }
});

test("obsolete state is discarded without parsing it or checking any PID", () => {
  const options = fixture();
  const first = prepareDevelopmentCache(options.root, "workbench", options);
  const parent = path.dirname(generation(first));
  const state = path.join(parent, "state.json");
  const oldGeneration = path.join(
    parent,
    "12345678-1234-1234-1234-123456789abc",
  );
  put(state, "broken JSON");
  put(path.join(oldGeneration, "vite/deps/old.js.map"));
  const cache = prepareDevelopmentCache(options.root, "workbench", options);
  assert.ok(fs.statSync(cache).isDirectory());
  assert.equal(fs.existsSync(state), false);
  assert.equal(fs.existsSync(oldGeneration), false);
});
