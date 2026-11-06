import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deliveries, packageDefinitionSource, sourceEntries } from "./plugin-source-recipes.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const json = async relative => JSON.parse(await readFile(path.join(root, ...relative.split("/")), "utf8"));
const registry = await json("dist/resources/registry/registry.json");
const release = await json("dist/resources/registry/release.json");
const pluginIds = registry.items.filter(item => item.id.startsWith("plugin/")).map(item => item.id.slice(7)).sort();
if (JSON.stringify(pluginIds) !== JSON.stringify(Object.keys(release.plugins).sort())) {
  throw new Error("Release plugin inventory mismatch");
}
for (const id of pluginIds) {
  const manifest = await json(`src/plugins/${id}/plugin.json`);
  if (release.plugins[id].version !== manifest.version) throw new Error(`Plugin manifest mismatch: ${id}`);
}
for (const delivery of deliveries) {
  const [, origin] = sourceEntries(delivery).find(([target]) => target === "definition.ts");
  const source = packageDefinitionSource(await readFile(path.join(root, ...origin.split("/")), "utf8"));
  if (!/from\s+["'](?:\.\.\/\.\.\/framework\/contracts\/ui-plugin|@za38\.03\/agent-ui-plugins\/contracts)["']/u.test(source) ||
      /\.\.\/\.\.\/(?:agent-ui|runtime|services)\//u.test(source)) {
    throw new Error(`Official plugin ${delivery.id} is not package compatible`);
  }
}
for (const adapter of await json("dist/optional-adapters-provenance.json")) {
  const copied = adapter.inputs.filter(file => {
    const logical = file.replaceAll("\\", "/");
    return logical.includes("src/internal/") || logical.includes("src/plugins/");
  });
  if (copied.length) throw new Error(`Optional facade copied product modules: ${copied.join(", ")}`);
}
console.log("Plugin release inventory, definition imports and optional adapter boundaries: OK");
