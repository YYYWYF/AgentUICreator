import { deliveries, portableSource } from "./plugin-source-recipes.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { packageRoot, readSourceLayout, sourcePath } from "./materialize-plugin-sources.mjs";

const json = async file => JSON.parse(await readFile(file, "utf8"));
const pkg = await json(path.join(packageRoot, "package.json"));
const catalog = await json(path.join(packageRoot, "dist/catalog.json"));
if (catalog.package.name !== pkg.name || catalog.package.version !== pkg.version) throw new Error("Stale Plugins catalog identity; rebuild before publishing");
const indexed = new Map([...catalog.plugins.flatMap(plugin => plugin.files), ...catalog.shared].map(file => [file.path, file]));
for (const entry of (await readSourceLayout()).files) {
  const publishedPath = entry.source.replace(/^src\//u, "sources/");
  const record = indexed.get(publishedPath);
  const source = await readFile(sourcePath(packageRoot, entry.source));
  const snapshot = await readFile(sourcePath(path.join(packageRoot, "dist"), publishedPath));
  if (!record || !source.equals(snapshot) || createHash("sha256").update(snapshot).digest("hex") !== record.sha256) {
    throw new Error(`Stale Plugins source snapshot: ${publishedPath}`);
  }
}
for (const [publishedPath, record] of indexed) {
  const canonical = await readFile(sourcePath(packageRoot, publishedPath.replace(/^sources\//u, "src/")));
  const snapshot = await readFile(sourcePath(path.join(packageRoot, "dist"), publishedPath));
  if (!canonical.equals(snapshot) || createHash("sha256").update(snapshot).digest("hex") !== record.sha256) throw new Error(`Stale canonical snapshot: ${publishedPath}`);
}
for (const plugin of catalog.plugins) {
  const manifest = await json(path.join(packageRoot, "src/plugins", plugin.id, "plugin.json"));
  if (manifest.version !== plugin.version) throw new Error(`Stale Plugin version: ${plugin.id}`);
}
const registry = await json(path.join(packageRoot, "dist/resources/registry/registry.json"));
if (registry.items.some(item => item.id === "integration/a2ui")) throw new Error("Deferred A2UI leaked into Plugins resources");
console.log(`Plugins catalog and ${indexed.size} source snapshots match their canonical owners.`);
for (const plugin of catalog.plugins.filter(plugin => plugin.application?.hostApplication)) {
  const recipe=deliveries.find(delivery=>delivery.id===plugin.id);
  const declared=recipe.applicationFiles.map(([target,origin])=>({target,path:`sources/plugins/${plugin.id}/${origin}`}));
  if (JSON.stringify(plugin.application.files.map(({target,path})=>({target,path})))!==JSON.stringify(declared)) throw new Error(`Stale application template plan: ${plugin.id}`);
  if(JSON.stringify(plugin.application.services)!==JSON.stringify(recipe.services)) throw new Error(`Stale application services: ${plugin.id}`);
  for(const file of [...plugin.application.files,...plugin.application.sharedFiles]) if(createHash("sha256").update(await readFile(sourcePath(path.join(packageRoot,"dist"),file.path))).digest("hex")!==file.sha256) throw new Error(`Stale application template: ${plugin.id}/${file.target}`);
}
for (const plugin of catalog.plugins.filter(plugin => plugin.takeover)) {
  if (plugin.takeover.schemaVersion !== 1 || !plugin.takeover.runtimeFiles?.length) throw new Error("Incomplete takeover distribution");
  for (const file of plugin.takeover.files) {
    const published = await readFile(sourcePath(path.join(packageRoot,"dist"),file.path));
    let source = await readFile(sourcePath(packageRoot,file.origin),"utf8");
    source = portableSource(deliveries.find(delivery => delivery.id === plugin.id), file.target, source);
    if (!published.equals(Buffer.from(source)) || createHash("sha256").update(published).digest("hex") !== file.sha256) throw new Error(`Stale takeover source: ${plugin.id}/${file.target}`);
  }
  for (const file of plugin.takeover.runtimeFiles) if (createHash("sha256").update(await readFile(sourcePath(path.join(packageRoot,"dist"),file.path))).digest("hex") !== file.sha256) throw new Error(`Stale takeover runtime: ${file.path}`);
}
console.log("Portable takeover closures and matching runtime artifacts verified.");
