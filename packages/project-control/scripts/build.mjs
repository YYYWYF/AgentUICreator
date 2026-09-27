import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
await mkdir(`${packageRoot}dist/runtime`, { recursive: true });
await build({
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
      builder.onResolve({ filter: /(?:^|\/)install\.mjs$/ }, () => ({
        path: "../../src/install.mjs", external: true,
      }));
    },
  }],
  banner: { js: 'import { createRequire as __controlCreateRequire } from "node:module"; const require = __controlCreateRequire(import.meta.url);' },
});
// The registry loader resolves ../registry from the compiled runtime.
await cp(`${root}packages/source-registry/registry`, `${packageRoot}dist/registry`, { recursive: true });
