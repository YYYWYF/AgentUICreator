import { copyFile, mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
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
    if (views.has(entry.view) || sources.has(entry.source)) throw new Error(`Duplicate plugin source owner: ${entry.view}`);
    if (!entry.source.startsWith("src/plugins/") && !entry.source.startsWith("src/shared/")) throw new Error(`Invalid source owner: ${entry.source}`);
    views.add(entry.view); sources.add(entry.source);
  }
  return layout;
}

/** Compatibility views preserve upstream bytes/import geometry; only canonical
 * plugin folders are maintained. These ignored views are build inputs, not a
 * second source authority and are not an API for user source takeover. */
export async function materializePluginSources(root = packageRoot) {
  const layout = await readSourceLayout(root);
  // Rebuild only declared generated trees, so removed files cannot silently
  // survive a layout change or enter the next TypeScript/browser build.
  const roots = new Set(["src/internal/vendor-generated/assistant-ui", "src/internal/adapters-generated/assistant-ui"]);
  for (const entry of layout.files) {
    if (entry.view.startsWith("resources/registry/items/") && entry.view.includes("/files/")) {
      roots.add(`${entry.view.split("/files/")[0]}/files`);
    }
  }
  for (const directory of roots) await rm(sourcePath(root, directory), { recursive: true, force: true });
  for (const entry of layout.files) {
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
  await materializePluginSources();
}
