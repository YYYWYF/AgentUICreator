import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { withPluginResourceViews } from "./plugin-resource-views.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));
const host = path.join(repository, "examples/creator-assistant-host");
const require = createRequire(path.join(repository, "packages/creator/package.json"));
const { register } = await import(pathToFileURL(require.resolve("tsx/esm/api")).href);
const unregister = register();
const { writeGeneratedPluginRegistry } = await import(pathToFileURL(path.join(repository, "packages/creator/operator/src/generate-plugin-registry.ts")).href);
const hostRequire = createRequire(path.join(host, "package.json"));
const { build } = await import(pathToFileURL(hostRequire.resolve("vite")).href);
const scratch = await mkdtemp(path.join(tmpdir(), "agent-ui-demand-build-"));
const disabledIds = ["lexical-edit-composer", "reasoning", "tool-group", "export-markdown-action"];
const results = [];

await withPluginResourceViews(async () => {
  for (const variant of ["full-styles", "on-demand", "disabled", "legacy-disabled", "legacy-reenabled"]) {
    const root = path.join(scratch, variant);
    await mkdir(root);
    for (const file of ["src", "index.html", "package.json", "tsconfig.json", "vite.config.ts", ".agent-ui"]) {
      await cp(path.join(host, file), path.join(root, file), { recursive: true });
    }
    await symlink(path.join(host, "node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    const source = path.join(root, "src/agent-ui");
    if (!variant.startsWith("legacy-")) {
    await cp(path.join(repository, "packages/plugins/resources/registry/items/foundation/core-runtime/files/runtime"), path.join(source, "runtime"), { recursive: true });
    await cp(path.join(repository, "packages/plugins/resources/registry/items/foundation/core/files/application/AgentUICompatibilityRoot.tsx"), path.join(source, "application/AgentUICompatibilityRoot.tsx"));
    await cp(path.join(repository, "packages/plugins/resources/registry/items/foundation/core/files/application/conversation-services.ts"), path.join(source, "application/conversation-services.ts"));
    await cp(path.join(repository, "packages/plugins/resources/registry/items/foundation/core-adapters/files/agent-ui/conversation/ConversationSurface.tsx"), path.join(source, "agent-ui/conversation/ConversationSurface.tsx"));
    await cp(path.join(repository, "packages/plugins/resources/registry/items/foundation/core-adapters/files/agent-ui/conversation/ScopedRendererBridge.tsx"), path.join(source, "agent-ui/conversation/ScopedRendererBridge.tsx"));
    }
    const stylesPath = path.join(source, "agent-ui/conversation/styles.css");
    const styles = await readFile(stylesPath, "utf8");
    await writeFile(stylesPath, styles.replace("@za38.03/agent-ui-plugins/styles.css", variant === "full-styles" || variant.startsWith("legacy-") ? "@za38.03/agent-ui-plugins/styles.css" : "@za38.03/agent-ui-plugins/styles-base.css"));
    const modelPath = path.join(source, "app-ui.json");
    if (variant === "disabled" || variant.startsWith("legacy-")) {
      const model = JSON.parse(await readFile(modelPath, "utf8"));
      function visit(value) {
        if (!value || typeof value !== "object") return;
        if (disabledIds.includes(value.pluginId)) value.enabled = false;
        for (const child of Object.values(value)) visit(child);
      }
      visit(model);
      await writeFile(modelPath, JSON.stringify(model, null, 2));
    }
    await writeGeneratedPluginRegistry(root, { initializeApplications: false });
    if (variant === "legacy-reenabled") {
      const model = JSON.parse(await readFile(modelPath, "utf8"));
      function enable(value) {
        if (!value || typeof value !== "object") return;
        if (disabledIds.includes(value.pluginId)) value.enabled = true;
        for (const child of Object.values(value)) enable(child);
      }
      enable(model);
      await writeFile(modelPath, JSON.stringify(model, null, 2));
      await writeGeneratedPluginRegistry(root, { initializeApplications: false });
    }
    const typecheck = spawnSync(process.execPath, [path.join(host, "node_modules/typescript/bin/tsc"), "--noEmit"], { cwd: root, stdio: "inherit", shell: false });
    if (typecheck.error) throw typecheck.error;
    assert.equal(typecheck.status, 0, `${variant} typecheck`);
    const retained = new Set();
    await build({ root, configFile: path.join(root, "vite.config.ts"), logLevel: "warn", plugins: [
      ...(variant === "full-styles" ? [{ name: "previous-full-styles", enforce: "pre", transform(code, id) {
        if (/[/\\]packages[/\\]plugins[/\\]dist[/\\][^/\\]+[/\\]index\.js$/u.test(id)) return code.replace(/^import "\.\.\/utilities\/[^"\n]+\.css";\n/gmu, "");
      } }] : []),
      { name: "inspect-production-modules", generateBundle(_options, bundle) {
        for (const item of Object.values(bundle)) if (item.type === "chunk") {
          for (const [id, info] of Object.entries(item.modules)) if (info.renderedLength > 0) retained.add(id.replaceAll("\\", "/"));
        }
      } },
    ] });
    let jsBytes = 0, cssBytes = 0, cssGzipBytes = 0;
    async function measure(directory) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await measure(file);
        else if (/\.(?:js|css)$/u.test(entry.name)) {
          const bytes = await readFile(file);
          if (entry.name.endsWith(".css")) { cssBytes += bytes.length; cssGzipBytes += gzipSync(bytes).length; }
          else jsBytes += bytes.length;
        }
      }
    }
    await measure(path.join(root, "dist"));
    await writeFile(path.join(root, "production-module-ids.json"), JSON.stringify([...retained].sort(), null, 2) + "\n");
    const registry = await readFile(path.join(source, "plugins/registry.generated.ts"), "utf8");
    if (variant === "disabled") for (const id of disabledIds) {
      assert(!registry.includes(`import("./${id}/definition")`), `disabled import: ${id}`);
      assert(![...retained].some(file => file.endsWith(`/plugins/dist/${id}/index.js`)), `disabled implementation: ${id}`);
      assert(![...retained].some(file => file.endsWith(`/plugins/dist/plugins/${id}/adapters/presentation/${id}.js`)), `disabled presentation: ${id}`);
    }
    assert(![...retained].some(file => /\/plugins\/dist\/(?:sources|resources|catalog)\//u.test(file)), "tooling resources leaked");
    assert(![...retained].some(file => /\/packages\/creator\//u.test(file)), "Creator leaked into production");
    results.push({ variant, jsBytes, cssBytes, cssGzipBytes, registeredImplementations: (registry.match(/import\("\.\//gu) ?? []).length });
  }
});
unregister();
assert(results[1].cssBytes < results[0].cssBytes, "on-demand CSS must be smaller than full CSS");
assert(results[2].cssBytes < results[1].cssBytes, "disabled CSS must shrink");
assert(results[2].jsBytes < results[1].jsBytes, "disabled JS must shrink");
assert(results[1].cssGzipBytes < results[0].cssGzipBytes, "on-demand CSS gzip must shrink");
assert(results[2].cssGzipBytes < results[1].cssGzipBytes, "disabled CSS gzip must shrink");
await writeFile(path.join(scratch, "results.json"), JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify({ scratch, results }, null, 2));
