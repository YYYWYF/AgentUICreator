import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
test("Composer subpath imports independently and Vite graph contains no other official plugin definitions", async () => {
  assert(import.meta.resolve("@za38.03/agent-ui-plugins/composer").endsWith("/dist/composer/index.js"));
  const pkg = JSON.parse(await readFile(`${packageRoot}package.json`, "utf8"));
  assert(pkg.exports["."]);
  assert(pkg.exports["./styles.css"]);
  const temporary = await mkdtemp(path.join(tmpdir(), "composer-bundle-"));
  let moduleIds = [];
  try {
    await writeFile(`${temporary}/entry.js`, 'export { default } from "@za38.03/agent-ui-plugins/composer";\n');
    const result = await build({ configFile: false, root: temporary, logLevel: "silent",
      resolve: { alias: { "@za38.03/agent-ui-plugins/composer": `${packageRoot}dist/composer/index.js` } },
      plugins: [{ name: "assert-graph", generateBundle() { moduleIds = [...this.getModuleIds()]; } }],
      build: { write: false, lib: { entry: `${temporary}/entry.js`, formats: ["es"] } },
    });
    const entry = (Array.isArray(result) ? result[0] : result).output.find(file => file.type === "chunk" && file.isEntry);
    assert(entry.code.includes("composer"));
    assert(entry.exports.includes("default"));
    assert(moduleIds.some(id => id.includes("plugins/dist/composer")));
    for (const name of ["feedback-actions", "reasoning", "chart-message", "artifact", "tool-group"]) {
      assert(!moduleIds.some(id => id.includes(`/dist/${name}/index.js`) ||
        id.includes(`/plugins/${name}/adapters/package-definition`) || id.includes(`/plugins/${name}/adapters/project/definition`)), `${name} definition entered bundle graph`);
    }
    const provenance = JSON.parse(await readFile(`${packageRoot}dist/build-provenance.json`, "utf8"));
    assert(provenance.inputs.every(id => !/plugin-(?:assistant-ui-feedback|reasoning|chart)/.test(id)));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
