import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { officialPackagePlugins } from "../src/package-plugins.ts";
import { loadAgentUISourceRegistry } from "../src/loader.ts";
import { resolveAgentUISourceItemClosure } from "../src/closure.ts";

/** Execute reference metadata only; presentation and manifest parsing are irrelevant here.
 * Constants and imported service IDs come from the actual source closure, not a second list.
 * This is a development/release check and never enters the generated frontend.
 */
export async function validateOfficialPackageServices(registry, catalog = officialPackagePlugins) {
  for (const plugin of catalog) {
    try {
      const files = new Map(resolveAgentUISourceItemClosure(registry, plugin.referenceSourceItemId)
        .flatMap(item => item.loadedFiles).map(file => [file.target, file.content.toString("utf8")]));
      const prefix = `plugins/${plugin.pluginId}/`;
      const bundled = await build({
        stdin: { contents: `export { default } from "./${prefix}definition.ts";`, resolveDir: "/" },
        bundle: true, write: false, platform: "node", format: "esm",
        plugins: [{ name: "reference-metadata", setup(builder) {
          builder.onResolve({ filter: /.*/ }, args => {
            const base = args.namespace === "reference" ? path.posix.dirname(args.importer) : "";
            const target = path.posix.normalize(path.posix.join(base, args.path));
            const resolved = [target, `${target}.ts`, `${target}.tsx`, `${target}.json`].find(file => files.has(file));
            if (!resolved) throw new Error(`Unresolved reference import: ${target}`);
            return { path: resolved, namespace: "reference" };
          });
          builder.onLoad({ filter: /.*/, namespace: "reference" }, args => {
            if (args.path === `${prefix}index.tsx`) return { contents: "export const AssistantUiComposerPlugin = () => null;", loader: "js" };
            if (args.path === "framework/contracts/ui-plugin.ts") return { contents: "export const parseUIPluginManifest = value => value;", loader: "js" };
            return { contents: files.get(args.path), loader: args.path.endsWith(".json") ? "json" : "ts" };
          });
        } }],
      });
      const { default: definition } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
      for (const field of ["provides", "inject", "optionalInject"]) {
        const actual = definition[field] ?? [];
        const declared = plugin.services[field];
        if (!Array.isArray(actual) || actual.some(value => typeof value !== "string") ||
            JSON.stringify([...actual].sort()) !== JSON.stringify([...declared].sort())) {
          throw new Error(`${field}: reference=${JSON.stringify(actual)}, catalog=${JSON.stringify(declared)}`);
        }
      }
    } catch (cause) {
      const error = new Error(`OFFICIAL_PACKAGE_SERVICE_METADATA_DRIFT: ${plugin.pluginId}: ${cause.message}`, { cause });
      error.code = "OFFICIAL_PACKAGE_SERVICE_METADATA_DRIFT";
      throw error;
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await validateOfficialPackageServices(await loadAgentUISourceRegistry());
  console.log("Official package service metadata verified against reference definitions.");
}
