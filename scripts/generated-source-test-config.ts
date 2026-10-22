import { tmpdir } from "node:os";
import path from "node:path";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generatedProjectFixture } from "../packages/creator/operator/tests/support/generated-project";
import pluginDeliveries from "../packages/plugins/src/catalog/plugin-delivery.json";
const root = fileURLToPath(new URL("..", import.meta.url));
const itemsRoot = path.join(root, "packages/plugins/resources/registry/items");
function collectFilesRoots(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  if (entries.some(entry => entry.isFile() && entry.name === "item.json")) {
    const files = path.join(directory, "files");
    return existsSync(files) ? [files] : [];
  }
  return entries.filter(entry => entry.isDirectory()).flatMap(entry => collectFilesRoots(path.join(directory, entry.name)));
}
const filesRoots = collectFilesRoots(itemsRoot);
const asPosixPath = (value: string) => value.replaceAll("\\", "/");
function pathIsWithin(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate.split("?", 1)[0]!);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
/** Source Registry files are templates sharing a logical generated-project root. */
export function generatedSourceTestConfig(packageRoot: string) {
  return {
    server: { fs: { allow: [root, realpathSync(tmpdir())] } },
    root: packageRoot,
    resolve: { dedupe: ["react", "react-dom", "@assistant-ui/react", "@assistant-ui/core"], alias: [
      { find: "@za38.03/agent-ui-plugins/catalog", replacement: path.join(root, "packages/plugins/src/catalog/index.ts") },
      { find: "@za38.03/agent-ui-creator/source-registry", replacement: path.join(root, "packages/creator/operator/src/source-catalog/index.ts") },
      { find: "@za38.03/agent-ui-plugins/composer-support", replacement: path.join(root, "packages/plugins/src/composer-support.ts") },
      { find: "@za38.03/agent-ui-plugins/plugin-support", replacement: path.join(root, "packages/plugins/src/plugin-support.ts") },
      ...pluginDeliveries.map(delivery => ({
        find: `@za38.03/agent-ui-plugins/${delivery.id}`,
        replacement: path.join(root, "packages/plugins/dist", delivery.id, "index.js"),
      })),
      { find: "@za38.03/agent-ui-plugins/form-tools", replacement: path.join(root, "packages/plugins/src/form-tools.ts") },
      { find: "@za38.03/agent-ui-plugins/theme", replacement: path.join(root, "packages/plugins/src/theme/theme-contract.ts") },
      { find: "@za38.03/agent-ui-plugins/generative-ui.css", replacement: path.join(root, "packages/plugins/src/internal/vendor-generated/assistant-ui/generative-ui/generative-ui.css") },
      { find: "@za38.03/agent-ui-plugins/generative-ui", replacement: path.join(root, "packages/plugins/src/generative-ui.ts") },
      { find: "@za38.03/agent-ui-plugins/demo-attachments", replacement: path.join(root, "packages/plugins/src/demo-attachments.ts") },
      { find: "@za38.03/agent-ui-plugins/lexical", replacement: path.join(root, "packages/plugins/src/lexical.tsx") },
      { find: "@za38.03/agent-ui-plugins/styles.css", replacement: path.join(root, "packages/plugins/src/styles.css") },
      { find: "@za38.03/agent-ui-core/testing", replacement: path.join(root, "packages/core/src/testing/index.ts") },
      { find: "@za38.03/agent-ui-creator/bootstrap", replacement: path.join(root, "packages/creator/operator/src/bootstrap/index.ts") },
      { find: "@za38.03/agent-ui-creator/mock-agent", replacement: path.join(root, "packages/creator/src/mock-agent/index.ts") },
      ...["plugins", "core", "renderer", "runtime"].map(name => ({
        find: `@za38.03/agent-ui-${name}`, replacement: path.join(root, `packages/${name}/src/index.ts`),
      })),
    ] },
    plugins: [{
      name: "generated-source-fixtures",
      enforce: "pre" as const,
      transform(code: string, id: string) {
        // Contract fixtures do not participate in Vite HMR; Vitest's hot stub has no data bag.
        if (id.endsWith("/application/composition-store.ts")) {
          return { code: code.replaceAll("import.meta.hot", "undefined"), map: null };
        }
        // DOM tests also use Node filesystem fixtures. Preserve their physical
        // module URL before Vite's browser asset transform rewrites new URL().
        if ((id.includes("/tests/") || id.endsWith("/src/bootstrap/default-presets.ts") || id.endsWith("/source-catalog/loader.ts") || id.endsWith("/operator/src/install.mjs") || id.includes("/scripts/")) && code.includes("import.meta.url")) {
          return { code: code.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|import\.meta\.url/g, token => token === "import.meta.url" ? JSON.stringify(pathToFileURL(id.split("?")[0]!).href) : token), map: null };
        }
      },
      async resolveId(this: any, source: string, importer: string | undefined) {
        if (!importer) return;
        const physical = source.startsWith(".") ? path.resolve(path.dirname(importer), source) : source;
        const templateRoot = filesRoots.find(files => physical.startsWith(files + path.sep));
        if (templateRoot && !importer.includes("/source-catalog/")) {
          const fixture = await generatedProjectFixture();
          const found = await this.resolve(path.join(fixture, path.relative(templateRoot, physical)), importer, { skipSelf: true });
          if (found) return found;
        }
        // Templates use the test host's installed frontend stack, rather than
        // requiring UI dependencies on the Source Registry package itself.
        if (importer.includes("/dist/sources/takeover/") && source === "../../framework/contracts/ui-plugin") return path.join(root,"packages/creator/operator/src/framework/contracts/ui-plugin.ts");
        if (!source.startsWith(".")) {
          if (!asPosixPath(importer).includes("/registry/items/")) return;
          return await this.resolve(source, path.join(packageRoot, "package.json"), { skipSelf: true })
            ?? await this.resolve(source, path.join(root, "packages/plugins/package.json"), { skipSelf: true });
        }
        if (source.endsWith("/foundation/core/files/plugins/index") || source.endsWith("/foundation/core/files/plugins/registry.generated")) {
          const fixture = await generatedProjectFixture();
          return path.join(fixture, "plugins", source.endsWith("/index") ? "index.ts" : "registry.generated.ts");
        }
        if (asPosixPath(importer).endsWith("/foundation/core/files/plugins/index.ts") && source === "./registry.generated") {
          return path.join(await generatedProjectFixture(), "plugins/registry.generated.ts");
        }
        if (!asPosixPath(importer).includes("/registry/items/")) return;
        const rootOfImporter = filesRoots.find(files => pathIsWithin(files, importer));
        if (!rootOfImporter) return;
        const logical = path.relative(rootOfImporter, path.resolve(path.dirname(importer), source));
        const fixture = await generatedProjectFixture();
        const materialized = await this.resolve(path.join(fixture, logical), importer, { skipSelf: true });
        if (materialized) return materialized;
        for (const files of filesRoots) {
          const found = await this.resolve(path.join(files, logical), importer, { skipSelf: true });
          if (found) return found;
        }
      },
    }],
    test: { environment: "jsdom", maxWorkers: 2, testTimeout: 30_000, setupFiles: [path.join(root, "packages/creator/operator/tests/support/dom-setup.ts")], include: ["tests/**/*.test.{ts,tsx,mjs}", "src/**/*.test.{ts,tsx}"], exclude: ["tests/fixtures/**"] },
  };
}
