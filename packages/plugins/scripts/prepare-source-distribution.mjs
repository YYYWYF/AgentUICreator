import { deliveries, portableSource, sourceEntries } from "./plugin-source-recipes.mjs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Curate this package's own resources; development fixtures and deferred
// resources must not leak into tarballs. Source files remain in the workspace.
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const source = path.join(packageRoot, "resources", "registry");
const destination = path.join(packageRoot, "dist", "resources", "registry");
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

// Source snapshots and catalog ship in the same tarball as their runtime entries.
// Test history fixtures remain in the workspace, never in the public tarball.
await cp(path.join(packageRoot, "src/plugins"), path.join(packageRoot, "dist/sources/plugins"), { recursive: true });
await cp(path.join(packageRoot, "src/shared"), path.join(packageRoot, "dist/sources/shared"), { recursive: true });
const layout = JSON.parse(await readFile(path.join(packageRoot, "source-layout.json"), "utf8"));
await writeFile(path.join(packageRoot, "dist/sources/source-layout.json"), JSON.stringify(layout, null, 2) + "\n");
const pkg = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
const { createHash } = await import("node:crypto");
const digest = buffer => createHash("sha256").update(buffer).digest("hex");
const plugins = [];
for (const { item } of published.filter(record => record.item.id.startsWith("plugin/"))) {
  const id = item.id.slice(7);
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "src/plugins", id, "plugin.json"), "utf8"));
  const files = await Promise.all(layout.files.filter(file => file.pluginId === id).map(async file => ({
    path: file.source.replace(/^src\//u, "sources/"), logicalPath: file.view, kind: file.kind,
    sha256: digest(await readFile(path.join(packageRoot, ...file.source.split("/")))),
  })));
  // Canonical modules with no legacy generated view still belong to the source
  // inventory. Discover them rather than maintaining a second handwritten list.
  const indexed = new Set(files.map(file => file.path));
  async function indexCanonical(directory) {
    for (const entry of await readdir(path.join(packageRoot, ...directory.split("/")), { withFileTypes: true })) {
      const origin = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) await indexCanonical(origin);
      else if (entry.isFile()) {
        const publishedPath = origin.replace(/^src\//u, "sources/");
        if (!indexed.has(publishedPath)) files.push({ path: publishedPath, logicalPath: origin, kind: "presentation", sha256: digest(await readFile(path.join(packageRoot, ...origin.split("/")))) });
      } else throw new Error(`Unsupported canonical source: ${origin}`);
    }
  }
  await indexCanonical(`src/plugins/${id}`);
  plugins.push({ id, version: manifest.version, application: deliveries.find(delivery => delivery.id === id) ? { schemaVersion: 1, preserveLegacySource: deliveries.find(delivery => delivery.id === id).preserveLegacySource === true, component: deliveries.find(delivery => delivery.id === id).component, scopeKind: deliveries.find(delivery => delivery.id === id).scopeKind, registration: deliveries.find(delivery => delivery.id === id).registration, runtimeContext: deliveries.find(delivery => delivery.id === id).runtimeContext === true, hostBindings: deliveries.find(delivery => delivery.id === id).hostBindings, railAction: deliveries.find(delivery => delivery.id === id).railAction, hostApplication: deliveries.find(delivery => delivery.id === id).hostApplication === true, services: deliveries.find(delivery => delivery.id === id).hostApplication ? deliveries.find(delivery => delivery.id === id).services : undefined, sharedFiles: await Promise.all((deliveries.find(delivery => delivery.id === id).applicationSharedFiles ?? []).map(async ([target,origin])=>({target,path:origin.replace(/^src\//u,"sources/"),sha256:digest(await readFile(path.join(packageRoot,...origin.split("/"))))}))), files: await Promise.all((deliveries.find(delivery => delivery.id === id).applicationFiles ?? []).map(async ([target, origin]) => ({target, path: `sources/plugins/${id}/${origin}`, sha256: digest(await readFile(path.join(packageRoot, "src/plugins", id, origin)))}))) } : undefined, sourceRoot: `sources/plugins/${id}`, files });
}
await writeFile(path.join(packageRoot, "dist/catalog.json"), JSON.stringify({ schemaVersion: 1,
  package: { name: pkg.name, version: pkg.version }, plugins,
  shared: await Promise.all(layout.files.filter(file => !file.pluginId).map(async file => ({
    path: file.source.replace(/^src\//u, "sources/"), logicalPath: file.view, kind: file.kind,
    sha256: digest(await readFile(path.join(packageRoot, ...file.source.split("/")))),
  }))),
  resources: "resources/registry/registry.json",
}, null, 2) + "\n");

// Portable takeover closure. Only mechanical import relocation is applied; the
// presentation bodies are the same source inputs compiled into the npm runtime.
for (const delivery of deliveries) {
  const { id } = delivery;
  const plugin = plugins.find(plugin => plugin.id === id);
  const entries = [];
  const add = async (target, origin, transform = text => text) => {
    const bytes = Buffer.from(transform(await readFile(path.join(packageRoot, origin), "utf8")));
    const snapshot = `sources/takeover/${id}/${target}`;
    await mkdir(path.dirname(path.join(packageRoot, "dist", snapshot)), { recursive: true });
    await writeFile(path.join(packageRoot, "dist", snapshot), bytes);
    entries.push({ target, path: snapshot, sha256: digest(bytes), origin });
  };
  for (const [target, origin] of sourceEntries(delivery)) await add(target, origin, text => portableSource(delivery, target, text));
  const api = `@za38.03/agent-ui-plugins/${delivery.supportEntry}`;
  plugin.takeover = { schemaVersion: 1, files: entries, sharedApi: api, requiredDependencies: {},
    sharedDependencies: ["react", "@za38.03/agent-ui-core", "@za38.03/agent-ui-renderer", "@za38.03/agent-ui-runtime", api, "@za38.03/agent-ui-plugins/styles.css"],
    compatibility: { [delivery.support]: 1 },
  };
}
const catalogPath = path.join(packageRoot, "dist/catalog.json");
const completeCatalog = JSON.parse(await readFile(catalogPath, "utf8"));
completeCatalog.plugins = plugins;
await writeFile(catalogPath, JSON.stringify(completeCatalog, null, 2) + "\n");
