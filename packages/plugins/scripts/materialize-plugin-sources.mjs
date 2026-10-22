import { copyFile, mkdir, readFile, writeFile, readdir, rm, rmdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = fileURLToPath(new URL("../", import.meta.url));

export function sourcePath(root, logical) {
  if (typeof logical !== "string" || !logical || logical.includes("\\") || logical.includes("\0") || /^[A-Za-z]:/.test(logical) ||
      path.posix.isAbsolute(logical) || path.win32.isAbsolute(logical) ||
      logical.split("/").some(part => part === ".." || part === "." || !part)) {
    throw new Error(`Unsafe plugin source path: ${logical}`);
  }
  return path.join(root, ...logical.split("/"));
}

export async function readSourceLayout(root = packageRoot) {
  const layout = JSON.parse(await readFile(path.join(root, "source-layout.json"), "utf8"));
  if (layout.schemaVersion !== 1 || !Array.isArray(layout.files)) throw new Error("Invalid plugin source layout");
  const views = new Set(), sources = new Set();
  for (const entry of layout.files) {
    sourcePath(root, entry.view); sourcePath(root, entry.source);
    if (entry.view.startsWith("resources/registry/items/plugin-")) throw new Error(`Obsolete plugin resource view: ${entry.view}`);
    if (views.has(entry.view) || sources.has(entry.source)) throw new Error(`Duplicate plugin source owner: ${entry.view}`);
    if (!entry.source.startsWith("src/plugins/") && !entry.source.startsWith("src/shared/")) throw new Error(`Invalid source owner: ${entry.source}`);
    views.add(entry.view); sources.add(entry.source);
  }
  return layout;
}

/** Remove generated Source Registry compatibility files after use. Item
 * manifests and all non-generated resources remain in the registry tree. */
export async function cleanGeneratedPluginResourceViews(root = packageRoot) {
  const layout = await readSourceLayout(root);
  const generatedFileRoots = new Set();
  for (const entry of layout.files) {
    if (!entry.view.startsWith("resources/registry/items/plugin/")) continue;
    const fileMarker = "/files/";
    const markerIndex = entry.view.indexOf(fileMarker);
    if (markerIndex >= 0) {
      generatedFileRoots.add(entry.view.slice(0, markerIndex + "/files".length));
      continue;
    }
    const target = sourcePath(root, entry.view);
    await rm(target, { force: true });
  }
  for (const directory of generatedFileRoots) await rm(sourcePath(root, directory), { recursive: true, force: true });

  // Pre-migration views are no longer listed in source-layout.json. Scan their
  // old namespace, including retired Plugins, without following directory links
  // or removing descriptors and other non-generated files.
  const itemsRoot = sourcePath(root, "resources/registry/items");
  const items = await readdir(itemsRoot, { withFileTypes: true }).catch(error => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  for (const item of items) {
    if (!item.isDirectory() || !item.name.startsWith("plugin-")) continue;
    const directory = path.join(itemsRoot, item.name);
    await rm(path.join(directory, "files"), { recursive: true, force: true });
    await rm(path.join(directory, "changelog.json"), { force: true });
    try { await rmdir(directory); }
    catch (error) {
      if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error;
    }
  }
}

/** Internal presentation views are needed by package compilation. Source
 * Registry plugin files are read from canonical owners directly and are only
 * materialized temporarily for the legacy TypeScript/Vitest fixture layout. */
export async function materializePluginSources(root = packageRoot, { resourceViews = false } = {}) {
  const layout = await readSourceLayout(root);
  const roots = new Set(["src/internal/vendor-generated/assistant-ui", "src/internal/adapters-generated/assistant-ui"]);
  await cleanGeneratedPluginResourceViews(root);
  for (const directory of roots) await rm(sourcePath(root, directory), { recursive: true, force: true });
  for (const entry of layout.files) {
    if (entry.view.startsWith("resources/registry/items/plugin/") && !resourceViews) continue;
    const destination = sourcePath(root, entry.view);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(sourcePath(root, entry.source), destination);
  }
  return layout;
}

/** Upstream sync tools operate on the historical logical tree. Persist their
 * reviewed output back into the sole canonical owners before the next build. */
export async function capturePresentationSources(root = packageRoot) {
  const layout = await readSourceLayout(root);
  const known = new Map(layout.files.map(entry => [entry.view, entry]));
  const visited = new Set();
  for (const [relative, kind] of [["src/internal/vendor-generated/assistant-ui", "upstream"], ["src/internal/adapters-generated/assistant-ui", "presentation"]]) {
    async function visit(directory) {
      for (const entry of await readdir(sourcePath(root, directory), { withFileTypes: true })) {
        const view = path.posix.join(directory, entry.name);
        if (entry.isDirectory()) { await visit(view); continue; }
        if (!entry.isFile()) throw new Error(`Unsupported upstream source: ${view}`);
        visited.add(view);
        let record = known.get(view);
        if (!record) {
          const suffix = view.slice(relative.length + 1);
          record = { view, source: `src/shared/${kind === "upstream" ? "upstream" : "adapters/presentation"}/assistant-ui/${suffix}`, kind };
          sourcePath(root, record.source);
          layout.files.push(record); known.set(view, record);
        }
        const destination = sourcePath(root, record.source);
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(sourcePath(root, view), destination);
      }
    }
    await visit(relative);
  }
  for (const entry of layout.files) {
    if (["upstream", "presentation"].includes(entry.kind) && !visited.has(entry.view)) {
      await rm(sourcePath(root, entry.source), { force: true });
    }
  }
  layout.files = layout.files.filter(entry => !["upstream", "presentation"].includes(entry.kind) || visited.has(entry.view));
  await writeFile(path.join(root, "source-layout.json"), JSON.stringify(layout, null, 2) + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await materializePluginSources(packageRoot, { resourceViews: process.argv.includes("--resource-views") });
}
