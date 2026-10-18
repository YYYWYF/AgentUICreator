import { build } from "esbuild";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnPnpmSync } from "../../../scripts/pnpm-process.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
await rm(path.join(packageRoot, "dist"), { recursive: true, force: true });
await mkdir(`${packageRoot}dist/runtime`, { recursive: true });
const buildId = randomUUID();
const result = await build({
  metafile: true,
  define: { __OPERATOR_BUILD_ID__: JSON.stringify(buildId) },
  entryPoints: [`${packageRoot}src/dev.ts`],
  outfile: `${packageRoot}dist/runtime/operator-runtime.mjs`,
  bundle: true, platform: "node", format: "esm", target: "node20",
  // TypeScript 7's parser uses its native executable. Resolve it from this
  // tool package, never from the user's Host or production dependencies.
  external: ["typescript", "typescript/*", "@za38.03/agent-ui-plugins/catalog"],
  alias: {
    "@za38.03/agent-ui-operator/bootstrap": `${root}packages/operator/src/bootstrap/index.ts`,
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
// Resource assets ship once, inside the Plugins dependency.
await rm(path.join(packageRoot, "dist/registry"), { recursive: true, force: true });
await rm(path.join(packageRoot, "dist/fixtures"), { recursive: true, force: true });
await build({ entryPoints: [path.join(packageRoot, "src/source-catalog/index.ts")], outfile: path.join(packageRoot, "dist/source-catalog/index.js"), bundle: true, platform: "node", format: "esm", target: "node20", external: ["@za38.03/agent-ui-plugins/catalog"] });
await build({ entryPoints: [path.join(packageRoot, "src/bootstrap/index.ts")],
  outfile: path.join(packageRoot, "dist/bootstrap/index.js"), bundle: true,
  platform: "node", format: "esm", target: "node20", external: ["@za38.03/agent-ui-plugins/catalog"] });

const inputs = {};
for (const file of Object.keys(result.metafile.inputs)) {
  const absolute = path.resolve(file);
  const relative = path.relative(root, absolute);
  if (!relative.startsWith("..") && !relative.includes("node_modules")) inputs[relative] = createHash("sha256").update(await readFile(absolute)).digest("hex");
}
await writeFile(`${packageRoot}dist/runtime/build.json`, JSON.stringify({ buildId, inputs }, null, 2));

// Publish declarations instead of exposing implementation .ts files to consumers.
await rm(path.join(packageRoot, "dist/types"), { recursive: true, force: true });
const declarations = spawnPnpmSync(["exec", "tsc", "-p", "tsconfig.declarations.json"], { cwd: packageRoot, stdio: "inherit" });
if (declarations.error) throw declarations.error;
if (declarations.status !== 0) throw new Error("Operator declaration build failed");
for (const entry of await readdir(path.join(packageRoot, "src"), { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".d.mts")) {
    await cp(path.join(packageRoot, "src", entry.name), path.join(packageRoot, "dist/types", entry.name));
  }
}
