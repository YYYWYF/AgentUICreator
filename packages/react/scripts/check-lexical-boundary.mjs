import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const reactRoot = path.join(root, "packages/react/src");
const upstream = /["'](?:@assistant-ui\/react-lexical|lexical|@lexical\/[^"']+)["']/u;
const errors = [];
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))).flat();
}
const reactFiles = (await files(reactRoot)).filter(file => /\.[jt]sx?$/u.test(file));
for (const file of reactFiles) {
  const relative = path.relative(reactRoot, file).replaceAll(path.sep, "/");
  if (upstream.test(await readFile(file, "utf8")) && !/^(?:lexical[^/]*|internal\/lexical[^/]*)/u.test(relative)) {
    errors.push(`${relative}: upstream Lexical coupling must live in the optional facade`);
  }
}
// Follow the main facade's import graph, so a transitive Lexical import fails too.
const byStem = new Map(reactFiles.map(file => [file.replace(/\.[jt]sx?$/u, ""), file]));
const visited = new Set();
async function visit(file) {
  if (visited.has(file)) return;
  visited.add(file);
  const source = await readFile(file, "utf8");
  if (upstream.test(source) || /^(?:lexical|internal\/lexical)/u.test(path.relative(reactRoot, file))) {
    errors.push(`${path.relative(reactRoot, file)}: Lexical reachable from main facade`);
  }
  for (const match of source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["'](\.[^"']+)["']/gu)) {
    const stem = path.resolve(path.dirname(file), match[1]).replace(/\.[jt]sx?$/u, "");
    const next = byStem.get(stem) ?? byStem.get(path.join(stem, "index"));
    if (next) await visit(next);
  }
}
await visit(path.join(reactRoot, "index.ts"));
const itemsRoot = path.join(root, "packages/source-registry/registry/items");
for (const file of await files(itemsRoot)) {
  if (!/[/\\]plugins[/\\].*\.[jt]sx?$/u.test(file)) continue;
  if (upstream.test(await readFile(file, "utf8"))) errors.push(`${path.relative(root, file)}: Source Plugins must use @agent-ui/react/lexical`);
}
// Optional peers never make the main facade install the editor. The Source Item
// and workspace lock must resolve exactly one Lexical release family.
const facade = JSON.parse(await readFile(path.join(root, "packages/react/package.json"), "utf8"));
const sourceItem = JSON.parse(await readFile(path.join(itemsRoot, "plugin-assistant-ui-lexical-composer-input/item.json"), "utf8"));
const integration = ["@assistant-ui/react-lexical", "lexical", "@lexical/react", "@lexical/utils", "@lexical/history", "@lexical/plain-text"];
for (const name of integration) {
  const expected = name === "@assistant-ui/react-lexical" ? "0.2.15" : "0.51.0";
  if (facade.dependencies?.[name] || !facade.peerDependenciesMeta?.[name]?.optional ||
      facade.peerDependencies?.[name] !== expected || facade.devDependencies?.[name] !== expected ||
      sourceItem.packages?.[name] !== expected) errors.push(`${name}: optional integration pin mismatch`);
}
if (facade.dependencies["@assistant-ui/react"] !== "0.15.23" || !facade.exports["./lexical"]) {
  errors.push("Keep assistant-ui pinned and expose the optional Lexical subpath");
}
const lock = await readFile(path.join(root, "pnpm-lock.yaml"), "utf8");
const families = new Set([...lock.matchAll(/^  ['"]?(?:lexical|@lexical\/[^@'"\s]+)@(\d+\.\d+\.\d+)/gmu)].map(match => match[1]));
if (families.size !== 1 || !families.has("0.51.0")) errors.push(`Lexical lockfile versions: ${[...families].join(", ")}`);
if (errors.length) throw new Error(errors.join("\n"));
console.log("Lexical optional facade and Source Plugin boundaries: OK");
