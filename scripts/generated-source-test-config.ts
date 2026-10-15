import path from "node:path";
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generatedProjectFixture } from "../packages/operator/tests/support/generated-project";
const root = fileURLToPath(new URL("..", import.meta.url));
const itemsRoot = path.join(root, "packages/source-registry/registry/items");
const filesRoots = readdirSync(itemsRoot).map(item => path.join(itemsRoot, item, "files"));
/** Source Registry files are templates sharing a logical generated-project root. */
export function generatedSourceTestConfig(packageRoot: string) {
  return {
    root: packageRoot,
    resolve: { dedupe: ["react", "react-dom", "@assistant-ui/react", "@assistant-ui/core"], alias: [
      { find: "@za38.03/agent-ui-react/generative-ui.css", replacement: path.join(root, "packages/react/src/internal/vendor/assistant-ui/generative-ui/generative-ui.css") },
      { find: "@za38.03/agent-ui-react/generative-ui", replacement: path.join(root, "packages/react/src/generative-ui.ts") },
      { find: "@za38.03/agent-ui-react/demo-attachments", replacement: path.join(root, "packages/react/src/demo-attachments.ts") },
      { find: "@za38.03/agent-ui-react/lexical", replacement: path.join(root, "packages/react/src/lexical.tsx") },
      { find: "@za38.03/agent-ui-react/styles.css", replacement: path.join(root, "packages/react/src/styles.css") },
      { find: "@za38.03/agent-ui-runtime-core/testing", replacement: path.join(root, "packages/runtime-core/src/testing/index.ts") },
      { find: "@za38.03/agent-ui-operator/bootstrap", replacement: path.join(root, "packages/operator/src/bootstrap/index.ts") },
      { find: "@za38.03/agent-ui-creator/mock-agent", replacement: path.join(root, "packages/creator/src/mock-agent/index.ts") },
      ...["react", "runtime-core", "renderer", "runtime", "source-registry"].map(name => ({
        find: `@za38.03/agent-ui-${name}`, replacement: path.join(root, `packages/${name}/src/index.ts`),
      })),
    ] },
    plugins: [{
      name: "generated-source-fixtures",
      enforce: "pre" as const,
      transform(code: string, id: string) {
        // DOM tests also use Node filesystem fixtures. Preserve their physical
        // module URL before Vite's browser asset transform rewrites new URL().
        if ((id.includes("/tests/") || id.endsWith("/src/bootstrap/default-presets.ts") || id.endsWith("/source-registry/src/loader.ts") || id.endsWith("/operator/src/install.mjs") || id.includes("/scripts/")) && code.includes("import.meta.url")) {
          return { code: code.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|import\.meta\.url/g, token => token === "import.meta.url" ? JSON.stringify(pathToFileURL(id.split("?")[0]!).href) : token), map: null };
        }
      },
      async resolveId(this: any, source: string, importer: string | undefined) {
        if (!importer) return;
        const physical = source.startsWith(".") ? path.resolve(path.dirname(importer), source) : source;
        const templateRoot = filesRoots.find(files => physical.startsWith(files + path.sep));
        if (templateRoot && !importer.includes("/source-registry/src/")) {
          const fixture = await generatedProjectFixture();
          const found = await this.resolve(path.join(fixture, path.relative(templateRoot, physical)), importer, { skipSelf: true });
          if (found) return found;
        }
        // Templates use the test host's installed frontend stack, rather than
        // requiring UI dependencies on the Source Registry package itself.
        if (!source.startsWith(".")) {
          if (!importer.includes("/registry/items/")) return;
          return await this.resolve(source, path.join(packageRoot, "package.json"), { skipSelf: true })
            ?? await this.resolve(source, path.join(root, "packages/react/package.json"), { skipSelf: true });
        }
        if (source.endsWith("/foundation-core/files/plugins/index") || source.endsWith("/foundation-core/files/plugins/registry.generated")) {
          const fixture = await generatedProjectFixture();
          return path.join(fixture, "plugins", source.endsWith("/index") ? "index.ts" : "registry.generated.ts");
        }
        if (importer.endsWith("/foundation-core/files/plugins/index.ts") && source === "./registry.generated") {
          return path.join(await generatedProjectFixture(), "plugins/registry.generated.ts");
        }
        if (!importer.includes("/registry/items/")) return;
        const rootOfImporter = filesRoots.find(files => importer.startsWith(files + path.sep));
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
    test: { environment: "jsdom", maxWorkers: 2, testTimeout: 30_000, setupFiles: [path.join(root, "packages/operator/tests/support/dom-setup.ts")], include: ["tests/**/*.test.{ts,tsx,mjs}", "src/**/*.test.{ts,tsx}"], exclude: ["tests/fixtures/**"] },
  };
}
