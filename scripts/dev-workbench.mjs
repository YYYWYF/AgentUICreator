import { createRequire } from "node:module";
import { spawnPnpm } from "./pnpm-process.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureWorkspaceDependencies } from "./ensure-workspace-dependencies.mjs";
import { prepareWorkbench } from "./prepare-workbench.mjs";
import { ensureExampleHost } from "./prepare-example-host.mjs";
import { hostPackages } from "./preparation-state.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
ensureWorkspaceDependencies();
prepareWorkbench();
await ensureExampleHost("platform");
// Reuse Creator's existing development TypeScript loader.
const require = createRequire(new URL("../packages/creator/package.json", import.meta.url));
const { tsImport } = await import(pathToFileURL(require.resolve("tsx/esm/api")).href);
const { startDevelopment } = await tsImport("../apps/creator-workbench/dev.ts", import.meta.url);
await startDevelopment({ workspaceRoot, args: process.argv.slice(2), packages: [...hostPackages, "creator"], spawnPnpm });
