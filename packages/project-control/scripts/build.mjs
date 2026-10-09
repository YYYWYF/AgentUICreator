import { build } from "esbuild";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
await mkdir(`${packageRoot}dist/runtime`, { recursive: true });
const buildId = randomUUID();
const result = await build({
  metafile: true,
  define: { __PROJECT_CONTROL_BUILD_ID__: JSON.stringify(buildId) },
  entryPoints: [`${packageRoot}src/dev.ts`],
  outfile: `${packageRoot}dist/runtime/project-control-runtime.mjs`,
  bundle: true, platform: "node", format: "esm", target: "node20",
  // TypeScript 7's parser uses its native executable. Resolve it from this
  // tool package, never from the user's Host or production dependencies.
  external: ["typescript", "typescript/*"],
  alias: {
    "@agent-ui/bootstrap": `${root}packages/bootstrap/src/index.ts`,
    "@agent-ui/source-registry": `${root}packages/source-registry/src/index.ts`,
  },
  plugins: [{
    name: "keep-installer-location",
    setup(builder) {
      builder.onResolve({ filter: /(?:^|\/)(?:install|runtime-integrity)\.mjs$/ }, args => ({
        path: `../../src/${path.basename(args.path)}`, external: true,
      }));
    },
  }],
  banner: { js: 'import { createRequire as __controlCreateRequire } from "node:module"; const require = __controlCreateRequire(import.meta.url);' },
});
// The registry loader resolves ../registry from the compiled runtime.
await cp(`${root}packages/source-registry/registry`, `${packageRoot}dist/registry`, { recursive: true });
await cp(`${root}packages/source-registry/fixtures`, `${packageRoot}dist/fixtures`, { recursive: true });

const inputs = {};
for (const file of Object.keys(result.metafile.inputs)) {
  const absolute = path.resolve(file);
  const relative = path.relative(root, absolute);
  if (!relative.startsWith("..") && !relative.includes("node_modules")) inputs[relative] = createHash("sha256").update(await readFile(absolute)).digest("hex");
}
await writeFile(`${packageRoot}dist/runtime/build.json`, JSON.stringify({ buildId, inputs }, null, 2));
