import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { prepareHostPackages } from "./prepare-host-packages.mjs";

// Exercise the installed catalog and Bootstrap without borrowing a maintained Host.
prepareHostPackages();
const repository = fileURLToPath(new URL("../", import.meta.url));
const pluginRoot = path.join(repository, "packages/plugins");
const creatorRoot = path.join(repository, "packages/creator");
// Only prepare the Node project APIs; frontend verification does not need the tool's browser UI.
for (const script of ["operator/scripts/build.mjs", "scripts/copy-operator-assets.mjs"]) {
  const result = spawnSync(process.execPath, [path.join(creatorRoot, script)], { cwd: repository, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Creator project API preparation: ${script}`);
}
const pluginRequire = createRequire(path.join(pluginRoot, "package.json"));
const creatorManifest = JSON.parse(await readFile(path.join(creatorRoot, "package.json"), "utf8"));
const pluginManifest = JSON.parse(await readFile(path.join(pluginRoot, "package.json"), "utf8"));
const creatorEntry = entry => import(pathToFileURL(path.join(creatorRoot, creatorManifest.exports[entry].import)).href);
const [{ initializeAgentUIProject }, { createAgentUIInitializationHost }, { synchronizeAgentUIPluginRegistry }] = await Promise.all([
  creatorEntry("./bootstrap"), creatorEntry("./project/host"), creatorEntry("./project/dev"),
]);
// The CJS React plugin may synchronously load Vite; finish loading Vite first.
const { build } = await import(pathToFileURL(pluginRequire.resolve("vite")).href);
const { default: react } = await import(pathToFileURL(pluginRequire.resolve("@vitejs/plugin-react")).href);
const { default: tailwindcss } = await import(pathToFileURL(pluginRequire.resolve("@tailwindcss/vite")).href);
const scratch = await realpath(await mkdtemp(path.join(tmpdir(), "agent-ui-demand-build-")));
assert.equal(path.dirname(scratch), await realpath(tmpdir()));
const evidence = path.join(repository, "artifacts/plugin-demand-build");
const disabledIds = ["chart-message", "reasoning", "tool-group", "export-markdown-action"];
const variants = ["full-styles", "on-demand", "disabled", "legacy-disabled", "legacy-reenabled"];
const results = [];
const logical = file => file.replaceAll("\\", "/");

async function linkDependency(source, target) {
  await mkdir(path.dirname(target), { recursive: true });
  await symlink(await realpath(source), target, process.platform === "win32" ? "junction" : "dir");
}

async function prepareDependencies() {
  // Share installed dependencies via scratch-owned links, never write into an existing node_modules.
  const installed = path.join(pluginRoot, "node_modules");
  const target = path.join(scratch, "node_modules");
  for (const entry of await readdir(installed, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "@za38.03") continue;
    await linkDependency(path.join(installed, entry.name), path.join(target, entry.name));
  }
  const dependencies = { ...pluginManifest.dependencies };
  for (const name of ["core", "renderer", "runtime", "plugins"]) {
    const source = path.join(repository, "packages", name);
    const manifest = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
    dependencies[manifest.name] = manifest.version;
    await linkDependency(source, path.join(target, manifest.name));
  }
  dependencies.react = pluginManifest.devDependencies.react;
  dependencies["react-dom"] = pluginManifest.devDependencies["react-dom"];
  return dependencies;
}

async function initializeProject(root, dependencies) {
  await mkdir(path.join(root, "src"), { recursive: true });
  await linkDependency(path.join(scratch, "node_modules"), path.join(root, "node_modules"));
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "agent-ui-demand-build-consumer", private: true, type: "module", dependencies,
  }, null, 2));
  await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: {
    target: "ES2022", lib: ["ES2022", "DOM", "DOM.Iterable"], module: "ESNext",
    moduleResolution: "Bundler", jsx: "react-jsx", strict: true, noEmit: true,
    esModuleInterop: true, resolveJsonModule: true, skipLibCheck: true, types: ["node", "react", "vite/client"],
  }, include: ["src"] }));
  await writeFile(path.join(root, "index.html"), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n');
  await writeFile(path.join(root, "src/main.tsx"), [
    'import { createRoot } from "react-dom/client";',
    'import { Agent } from "./agent-ui/application/Agent";',
    'createRoot(document.getElementById("root")!).render(<Agent endpoint="/agent" />);', "",
  ].join("\n"));
  await initializeAgentUIProject({ projectRoot: root, mode: "assistant", sourceRoot: "src/agent-ui" }, {
    ...createAgentUIInitializationHost(),
    // Production consumer fixture: no development-tool dependency or managed entry.
    installOperatorEntry: async () => [],
  });
  // Include a headless Plugin with its own stylesheet. Shared fallback utilities
  // can legitimately survive disabling renderers; Chart exercises actual CSS removal.
  const modelPath = path.join(root, "src/agent-ui/app-ui.json");
  const model = JSON.parse(await readFile(modelPath, "utf8"));
  (model.applicationPlugins ??= []).push({ pluginId: "chart-message" });
  await writeFile(modelPath, JSON.stringify(model, null, 2) + "\n");
  await synchronizeAgentUIPluginRegistry(root);
}

async function setEnabled(root, enabled) {
  const file = path.join(root, "src/agent-ui/app-ui.json");
  const model = JSON.parse(await readFile(file, "utf8"));
  const found = new Set();
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (disabledIds.includes(value.pluginId)) {
      value.enabled = enabled;
      found.add(value.pluginId);
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(model);
  assert.deepEqual([...found].sort(), [...disabledIds].sort(), "all compared Plugins must exist in the current preset");
  await writeFile(file, JSON.stringify(model, null, 2) + "\n");
  await synchronizeAgentUIPluginRegistry(root);
}

async function measure(directory) {
  const totals = { jsBytes: 0, cssBytes: 0, cssGzipBytes: 0 };
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await measure(file);
      for (const key of Object.keys(totals)) totals[key] += nested[key];
    } else if (/\.(?:js|css)$/u.test(entry.name)) {
      const bytes = await readFile(file);
      if (entry.name.endsWith(".css")) { totals.cssBytes += bytes.length; totals.cssGzipBytes += gzipSync(bytes).length; }
      else totals.jsBytes += bytes.length;
    }
  }
  return totals;
}

let passed = false;
try {
  await mkdir(evidence, { recursive: true });
  const dependencies = await prepareDependencies();
  const initialized = path.join(scratch, "bootstrap");
  await initializeProject(initialized, dependencies);
  for (const variant of variants) {
    const root = path.join(scratch, variant);
    await mkdir(root);
    for (const file of ["src", "index.html", "package.json", "tsconfig.json", ".agent-ui"]) {
      await cp(path.join(initialized, file), path.join(root, file), { recursive: true });
    }
    await linkDependency(path.join(scratch, "node_modules"), path.join(root, "node_modules"));
    const stylesPath = path.join(root, "src/agent-ui/styles.css");
    const styles = await readFile(stylesPath, "utf8");
    assert(styles.includes("@za38.03/agent-ui-plugins/styles-base.css"), "Bootstrap must provide the current style entry");
    if (variant === "full-styles" || variant.startsWith("legacy-")) {
      await writeFile(stylesPath, styles.replace("@za38.03/agent-ui-plugins/styles-base.css", "@za38.03/agent-ui-plugins/styles.css"));
    }
    if (variant === "disabled" || variant.startsWith("legacy-")) await setEnabled(root, false);
    if (variant === "legacy-reenabled") await setEnabled(root, true);

    const registry = await readFile(path.join(root, "src/agent-ui/plugins/registry.generated.ts"), "utf8");
    const registered = new Set([...registry.matchAll(/import\(\s*['"]\.\/([^/'"]+)\/definition['"]\s*\)/gu)].map(match => match[1]));
    const disabled = variant === "disabled" || variant === "legacy-disabled";
    for (const id of disabledIds) assert.equal(registered.has(id), !disabled, `${variant}: ${id} definition import`);
    const typecheck = spawnSync(process.execPath, [path.join(pluginRoot, "node_modules/typescript/lib/tsc.js"), "--noEmit"], {
      cwd: root, stdio: "inherit", shell: false,
    });
    if (typecheck.error) throw typecheck.error;
    assert.equal(typecheck.status, 0, `${variant} typecheck`);
    const retained = new Set();
    await build({ root, configFile: false, logLevel: "warn", plugins: [
      react(), tailwindcss(),
      { name: "inspect-production-modules", generateBundle(_options, bundle) {
        for (const item of Object.values(bundle)) if (item.type === "chunk") {
          for (const [id, info] of Object.entries(item.modules)) if (info.renderedLength > 0) retained.add(logical(id));
        }
      } },
    ] });
    await writeFile(path.join(evidence, `${variant}-modules.json`), JSON.stringify([...retained].sort(), null, 2) + "\n");
    // Shared components can remain reachable through ConversationSurface fallbacks.
    // The disabled Plugin's registration and npm entry must disappear, not shared presentation.
    for (const id of disabledIds) {
      assert.equal([...retained].some(file => file.endsWith(`/plugins/dist/${id}/index.js`)), !disabled, `${variant}: ${id} npm implementation`);
    }
    assert(![...retained].some(file => /\/plugins\/dist\/(?:sources|resources|catalog)\//u.test(file)), "tooling resources leaked");
    assert(![...retained].some(file => /\/packages\/creator\//u.test(file)), "Creator leaked into production");
    const result = { variant, ...await measure(path.join(root, "dist")), registeredImplementations: registered.size };
    results.push(result);
    console.log(JSON.stringify(result));
  }
  const [full, demand, disabled] = results;
  assert(demand.cssBytes < full.cssBytes, "on-demand CSS must be smaller than full CSS");
  assert(disabled.cssBytes < demand.cssBytes, "disabled CSS must shrink");
  assert(disabled.jsBytes < demand.jsBytes, "disabled JS must shrink");
  assert(demand.cssGzipBytes < full.cssGzipBytes, "on-demand CSS gzip must shrink");
  assert(disabled.cssGzipBytes < demand.cssGzipBytes, "disabled CSS gzip must shrink");
  passed = true;
} finally {
  await writeFile(path.join(evidence, "results.json"), JSON.stringify({ node: process.version, platform: process.platform, passed, results }, null, 2) + "\n");
  // Only remove the verified absolute mkdtemp directory; links leave their targets intact.
  await rm(scratch, { recursive: true, force: true });
}
console.log(`Plugin demand build verification passed: ${path.join(evidence, "results.json")}`);
