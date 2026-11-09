import { createRequire } from "node:module";
import { spawnPnpm } from "./pnpm-process.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureWorkspaceDependencies } from "./ensure-workspace-dependencies.mjs";
import { prepareWorkbench } from "./prepare-workbench.mjs";
import { ensureExampleHost } from "./prepare-example-host.mjs";
import { hostPackages } from "./workspace-build-cache.mjs";
import { acquireDevelopmentSession } from "./development-cache.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
// Admission precedes install/build, not just Vite's much later port check.
const release = acquireDevelopmentSession(workspaceRoot);
process.once("exit", release);
try {
  ensureWorkspaceDependencies();
  prepareWorkbench();
  await ensureExampleHost("platform");
  // Reuse Creator's existing development TypeScript loader.
  const require = createRequire(
    new URL("../packages/creator/package.json", import.meta.url),
  );
  const { tsImport } = await import(
    pathToFileURL(require.resolve("tsx/esm/api")).href
  );
  const { startDevelopment } = await tsImport(
    "../apps/creator-workbench/dev.ts",
    import.meta.url,
  );
  await startDevelopment({
    workspaceRoot,
    args: process.argv.slice(2),
    packages: [...hostPackages, "creator"],
    spawnPnpm,
  });
} finally {
  process.off("exit", release);
  release();
}
