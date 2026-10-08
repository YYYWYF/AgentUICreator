import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
test("Composer subpath imports independently and Vite graph contains no other official plugins", async () => {
  assert(import.meta.resolve("@agent-ui/plugins/assistant-ui-composer").endsWith("/dist/assistant-ui-composer/index.js"));
  const pkg = JSON.parse(await readFile(`${packageRoot}package.json`, "utf8"));
  assert.equal(pkg.exports["."], undefined);
  const temporary = await mkdtemp(path.join(tmpdir(), "composer-bundle-"));
  let moduleIds = [];
  try {
    await writeFile(`${temporary}/entry.js`, 'export { default } from "@agent-ui/plugins/assistant-ui-composer";\n');
    const result = await build({ configFile: false, root: temporary, logLevel: "silent",
      resolve: { alias: { "@agent-ui/plugins/assistant-ui-composer": `${packageRoot}dist/assistant-ui-composer/index.js` } },
      plugins: [{ name: "assert-graph", generateBundle() { moduleIds = [...this.getModuleIds()]; } }],
      build: { write: false, lib: { entry: `${temporary}/entry.js`, formats: ["es"] } },
    });
    const entry = (Array.isArray(result) ? result[0] : result).output.find(file => file.type === "chunk" && file.isEntry);
    assert(entry.code.includes("assistant-ui-composer"));
    assert(entry.exports.includes("default"));
    assert(moduleIds.some(id => id.includes("plugins/dist/assistant-ui-composer")));
    for (const name of ["assistant-ui-feedback-actions", "assistant-ui-reasoning", "chart-message", "artifact", "assistant-ui-tool-group"]) {
      assert(!moduleIds.some(id => id.includes(`/plugins/${name}/`)), `${name} entered bundle graph`);
    }
    const provenance = JSON.parse(await readFile(`${packageRoot}dist/build-provenance.json`, "utf8"));
    assert(provenance.inputs.every(id => !/plugin-(?:assistant-ui-feedback|assistant-ui-reasoning|chart)/.test(id)));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
