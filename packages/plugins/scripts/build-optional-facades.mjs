import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const provenance = [];
// Bundle only these upstream adapters. React, Lexical and other project peers
// stay external; generated projects need only product public imports.
for (const [entry, dependency] of [
  ["lexical.tsx", "@assistant-ui/react-lexical"],
  ["form-tools.ts", "@assistant-ui/react-hook-form"],
]) {
  const output = await build({
    entryPoints: [path.join(root, "src", entry)],
    outfile: path.join(root, "dist", entry.replace(/\.tsx?$/, ".js")),
    bundle: true, packages: "external", format: "esm", platform: "browser", jsx: "automatic", sourcemap: true, metafile: true,
    plugins: [{ name: "package-owned-optional-adapter", setup(builder) {
      // Keep product modules shared with the root/source-owned presentation.
      // Bundling these would create private copies of Runtime/React contexts.
      builder.onResolve({ filter: /^\.{1,2}\// }, args => {
        const relative = path.relative(path.join(root, "src"), args.importer);
        if (args.importer && !relative.startsWith("..") && !path.isAbsolute(relative)) return { path: args.path, external: true };
      });
      builder.onResolve({ filter: /^@assistant-ui\/react-(?:lexical|hook-form)$/ }, args =>
        args.path === dependency ? { path: require.resolve(dependency), external: false } : undefined);
    } }],
  });
  const copiedContexts = Object.keys(output.metafile.inputs).filter(file => {
    const logical = file.replaceAll("\\", "/");
    return logical.includes("src/internal/") || logical.includes("src/plugins/");
  });
  if (copiedContexts.length) throw new Error(`Optional facade copied product modules: ${copiedContexts.join(", ")}`);
  const manifest = JSON.parse(await readFile(path.resolve(path.dirname(require.resolve(dependency)), "../package.json"), "utf8"));
  provenance.push({ entry, package: manifest.name, version: manifest.version, license: manifest.license, inputs: Object.keys(output.metafile.inputs) });
}
await writeFile(path.join(root, "dist/optional-adapters-provenance.json"), JSON.stringify(provenance, null, 2) + "\n");
