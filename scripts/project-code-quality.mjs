import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript-ui-audit";
import { deliveries, sourceEntries } from "../packages/plugins/scripts/plugin-source-recipes.mjs";
import { formatProjectCode } from "../packages/creator/operator/src/project/generated-code-format.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const plugins = path.join(root, "packages/plugins");
const layout = JSON.parse(await readFile(path.join(plugins, "source-layout.json"), "utf8"));
const files = new Set(layout.files.filter(file => file.kind === "project").map(file => file.source));
for (const delivery of deliveries) {
  for (const [, origin] of sourceEntries(delivery)) files.add(origin);
  for (const [, origin] of [...delivery.applicationFiles ?? [], ...Object.values(delivery.applicationModeFiles ?? {}).flat()]) files.add(`src/plugins/${delivery.id}/${origin}`);
  for (const [, origin] of delivery.applicationSharedFiles ?? []) files.add(origin);
}
const owners = new Map(layout.files.map(file => [file.view, file.source]));
async function visit(directory) {
  for (const entry of await readdir(path.join(plugins, ...directory.split("/")), { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) await visit(relative);
    else if (entry.name === "item.json") {
      const item = JSON.parse(await readFile(path.join(plugins, ...relative.split("/")), "utf8"));
      for (const file of item.files) {
        const view = path.posix.join(directory, file.source);
        files.add(owners.get(view) ?? view);
      }
    }
  }
}
for (const directory of ["foundation", "integration", "demo"]) await visit(`resources/registry/items/${directory}`);
let checked = 0;
const different = [];
for (const relative of [...files].sort()) {
  if (!/\.tsx?$/u.test(relative) || relative.includes("/upstream/")) continue;
  const file = path.join(plugins, ...relative.split("/"));
  const source = await readFile(file, "utf8");
  const formatted = await formatProjectCode(source);
  checked++;
  if (source.replaceAll("\r\n", "\n") === formatted) continue;
  different.push(relative);
  if (process.argv.includes("--write")) await writeFile(file, formatted);
}
console.log(JSON.stringify({ checked, [process.argv.includes("--write") ? "formatted" : "different"]: different }, null, 2));
if (different.length && !process.argv.includes("--write")) process.exitCode = 1;
if (!process.argv.includes("--write")) {
  const config = ts.readConfigFile(path.join(plugins, "tsconfig.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, plugins);
  const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noUnusedLocals: true, noUnusedParameters: true });
  const unused = program.getSemanticDiagnostics().filter(diagnostic => {
    if (![6133, 6192, 6196, 6198, 6199].includes(diagnostic.code) || !diagnostic.file) return false;
    const relative = path.relative(plugins, diagnostic.file.fileName).split(path.sep).join("/");
    return (relative.startsWith("src/plugins/") || relative.startsWith("src/shared/")) && !relative.includes("/upstream/");
  });
  console.log(`Product adapter unused declarations: ${unused.length}`);
  for (const diagnostic of unused) console.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, " "), diagnostic.file.fileName);
  if (unused.length) process.exitCode = 1;
}
