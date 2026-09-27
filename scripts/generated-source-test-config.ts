import path from "node:path";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generatedProjectFixture } from "../packages/project-control/tests/support/generated-project";
const root = fileURLToPath(new URL("..", import.meta.url));
const itemsRoot = path.join(root, "packages/source-registry/registry/items");
const filesRoots = readdirSync(itemsRoot).map(item => path.join(itemsRoot, item, "files"));
/** Source Registry files are templates sharing a logical generated-project root. */
export function generatedSourceTestConfig(packageRoot: string) {
  return {
    root: packageRoot,
    resolve: { alias: [
      { find: "@agent-ui/react/styles.css", replacement: path.join(root, "packages/react/src/styles.css") },
      { find: "@agent-ui/runtime-core/testing", replacement: path.join(root, "packages/runtime-core/src/testing/index.ts") },
      ...["react", "runtime-core", "runtime-react", "runtime-conversation", "bootstrap", "source-registry", "mock-agent"].map(name => ({
        find: `@agent-ui/${name}`, replacement: path.join(root, `packages/${name}/src/index.ts`),
      })),
    ] },
    plugins: [{
      name: "generated-source-fixtures",
      async resolveId(this: any, source: string, importer: string | undefined) {
        if (!importer || !source.startsWith(".")) return;
        if (source.endsWith("/foundation-core/files/plugins/index") || source.endsWith("/foundation-core/files/plugins/registry.generated")) {
          const fixture = await generatedProjectFixture();
          return path.join(fixture, "plugins", source.endsWith("/index") ? "index.ts" : "registry.generated.ts");
        }
        if (!importer.includes("/registry/items/")) return;
        if (!importer.includes("/registry/items/")) return;
        const rootOfImporter = filesRoots.find(files => importer.startsWith(files + path.sep));
        if (!rootOfImporter) return;
        const logical = path.relative(rootOfImporter, path.resolve(path.dirname(importer), source));
        for (const files of filesRoots) {
          const found = await this.resolve(path.join(files, logical), importer, { skipSelf: true });
          if (found) return found;
        }
      },
    }],
    test: { environment: "jsdom", include: ["tests/**/*.test.{ts,tsx,mjs}", "src/**/*.test.{ts,tsx}"], exclude: ["tests/fixtures/**"] },
  };
}
