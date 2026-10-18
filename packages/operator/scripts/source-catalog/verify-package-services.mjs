import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { officialPackagePlugins } from "../../../plugins/src/catalog/package-plugins.ts";
import { loadAgentUISourceRegistry } from "../../src/source-catalog/loader.ts";
import { resolveAgentUISourceItemClosure } from "../../../plugins/src/catalog/closure.ts";

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
            if (args.path === "@za38.03/agent-ui-plugins") return {path:args.path,namespace:"public-metadata"};
            if (!args.path.startsWith(".")) return { path: import.meta.resolve(args.path), external: true };
            const base = args.namespace === "reference" ? path.posix.dirname(args.importer) : "";
            const target = path.posix.normalize(path.posix.join(base, args.path));
            const resolved = [target, `${target}.ts`, `${target}.tsx`, `${target}.json`, `${target}/index.ts`, `${target}/index.tsx`].find(file => files.has(file));
            if (!resolved) throw new Error(`Unresolved reference import: ${target}`);
            return { path: resolved, namespace: "reference" };
          });
          builder.onLoad({filter:/.*/,namespace:"public-metadata"}, () => {
            // Evaluate metadata without loading browser UI/CSS. Locale defaults
            // are actual package data; presentation functions never execute here.
            const names = new Set([...files.values()].flatMap(text => [...text.matchAll(/(?:import|export)\s*\{([^}]+)\}\s*from\s*["']@za38\.03\/agent-ui-plugins["']/gu)].flatMap(match => match[1].split(",").map(name=>name.trim()).filter(name=>name && !name.startsWith("type ")).map(name=>name.split(/\s+as\s+/u)[0]))));
            const locale = new URL("../../../plugins/dist/locale.js", import.meta.url).href;
            return {contents: `export {AGENT_UI_PRESENTATION_LOCALES} from ${JSON.stringify(locale)};\n` + [...names].filter(name=>name!=="AGENT_UI_PRESENTATION_LOCALES").map(name=>`export const ${name}=()=>null;`).join("\n"),loader:"js"};
          });
          builder.onLoad({ filter: /.*/, namespace: "reference" }, args => {
            if (args.path === `${prefix}index.tsx`) {
              // Legacy reference renderers may have different names from the
              // newly published component. Stub their real exported bindings;
              // this check evaluates service metadata, never presentation.
              const names = [...files.get(args.path).matchAll(/export\s+(?:const|function|class)\s+(\w+)/gu)].map(match => match[1]);
              return { contents: [...new Set(names)].map(name => `export const ${name} = () => null;`).join("\n"), loader: "js" };
            }
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
