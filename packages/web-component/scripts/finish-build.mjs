import { copyFile, readFile, readdir, unlink, writeFile } from "node:fs/promises";
const dist = new URL("../dist/", import.meta.url);
let pluginCSS = "";
for (const name of await readdir(dist)) {
  if (name.endsWith(".css")) {
    pluginCSS += await readFile(new URL(name, dist), "utf8");
    await unlink(new URL(name, dist));
  }
}
// Vite extracts Plugin side-effect imports. Move that CSS into each standalone
// script's Shadow Root stylesheet, so hosts never need a global stylesheet.
for (const name of ["agent-ui.js", "agent-ui.es.js"]) {
  const file = new URL(name, dist);
  const source = await readFile(file, "utf8");
  const marker = /(["'`])__AGENT_UI_BUNDLED_PLUGIN_CSS__\1/g;
  if (!marker.test(source)) throw new Error(`Shadow stylesheet marker missing in ${name}.`);
  await writeFile(file, source.replace(marker, () => JSON.stringify(pluginCSS)));
}
await writeFile(new URL("types.d.ts", dist), 'export * from "./types/src/register.js";\n');
await copyFile(new URL("../../react/THIRD_PARTY_NOTICES.md", import.meta.url), new URL("THIRD_PARTY_NOTICES.md", dist));
