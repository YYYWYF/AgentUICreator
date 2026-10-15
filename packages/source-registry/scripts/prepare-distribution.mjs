import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Curate this package's own resources; development fixtures and deferred
// resources must not leak into tarballs. Source files remain in the workspace.
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const source = path.join(packageRoot, "registry");
const destination = path.join(packageRoot, "dist", "registry");
const manifest = JSON.parse(await readFile(path.join(source, "registry.json"), "utf8"));
const records = await Promise.all(manifest.items.map(async entry => ({ entry,
  item: JSON.parse(await readFile(path.join(source, entry.path), "utf8")),
})));
const disabled = new Set(["integration/a2ui"]);
let changed;
do {
  changed = false;
  for (const { item } of records) if (!disabled.has(item.id) && item.requires?.some(id => disabled.has(id))) {
    disabled.add(item.id); changed = true;
  }
} while (changed);
const published = records.filter(({ item }) => !disabled.has(item.id));
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await writeFile(path.join(destination, "registry.json"), JSON.stringify({ items: published.map(record => record.entry) }, null, 2) + "\n");
await cp(path.join(source, "release.json"), path.join(destination, "release.json"));
for (const { entry, item } of published) {
  const itemRoot = path.dirname(entry.path);
  await mkdir(path.join(destination, itemRoot), { recursive: true });
  await cp(path.join(source, entry.path), path.join(destination, entry.path));
  if (item.id.startsWith("plugin/")) await cp(path.join(source, itemRoot, "changelog.json"), path.join(destination, itemRoot, "changelog.json"));
  for (const file of item.files) {
    const target = path.join(destination, itemRoot, file.source);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(source, itemRoot, file.source), target);
  }
}
console.log(`Prepared ${published.length} publishable resources; A2UI and development fixtures excluded.`);

// TypeScript preserves the source JSON specifier. Its published asset lives
// beside the compiled module in the curated registry, not at the package root.
const packagePlugins = path.join(packageRoot, "dist", "package-plugins.js");
const compiled = await readFile(packagePlugins, "utf8");
await writeFile(packagePlugins, compiled.replace('"../registry/', '"./registry/'));
