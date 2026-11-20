import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { resolve as resolveModule } from "import-meta-resolve";
import type { Loader } from "esbuild";

/** Development-only compilation; npm installations keep using built entries. */
export async function compileDevelopmentEntry(entry: string, cacheRoot: string): Promise<string> {
  const { build, transform } = await import("esbuild");
  const loaders: Record<string, Loader> = { ".ts": "ts", ".tsx": "tsx", ".js": "js", ".mjs": "js", ".mts": "ts", ".cjs": "js" };
  const output = await build({
    entryPoints: [entry], bundle: true, packages: "external", platform: "node",
    format: "esm", target: "node20.0", write: false,
    banner: { js: 'import { createRequire as __developmentRequire } from "node:module"; const require = __developmentRequire(import.meta.url);' },
    plugins: [{ name: "preserve-source-locations", setup(builder) {
      // The cache sits below node_modules, outside the owner's package scope.
      // Resolve external imports from their source, including package self imports.
      builder.onResolve({ filter: /^[^./]|^\.[^./]/ }, args => {
        if (!args.importer || path.isAbsolute(args.path)) return;
        const parent = pathToFileURL(args.importer);
        return { path: args.kind === "require-call"
          ? createRequire(parent).resolve(args.path)
          : resolveModule(args.path, parent.href), external: true };
      });
      builder.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async args => {
        const loader = loaders[path.extname(args.path)];
        if (!loader) return;
        // Resource URLs and package resolution must retain each source owner.
        // Use the parser so literal strings containing import.meta.url survive.
        const transformed = await transform(await readFile(args.path, "utf8"), {
          loader, format: "esm", target: "node20.0", sourcefile: args.path,
          define: { "import.meta.url": JSON.stringify(pathToFileURL(args.path).href) },
        });
        return { contents: transformed.code, loader: "js", resolveDir: path.dirname(args.path) };
      });
    } }],
  });
  const code = output.outputFiles[0]?.contents;
  if (!code) throw new Error("Development compilation produced no entry.");
  const file = path.join(cacheRoot, `${createHash("sha256").update(code).digest("hex")}.mjs`);
  await mkdir(cacheRoot, { recursive: true });
  // Content-addressed entries avoid overwriting a module open in another process.
  await writeFile(file, code, { flag: "wx" }).catch((error: unknown) => {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
  });
  return file;
}
