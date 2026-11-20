import path from "node:path";
import { spawnPnpm } from "./pnpm-process.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureWorkspaceDependencies } from "./ensure-workspace-dependencies.mjs";
import { prepareWorkbench } from "./prepare-workbench.mjs";
import { ensureExampleHost } from "./prepare-example-host.mjs";
import { hostPackages } from "./workspace-build-cache.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
ensureWorkspaceDependencies();
prepareWorkbench();
await ensureExampleHost("platform");
const { compileDevelopmentEntry } = await import("../packages/creator/dist/development-source.js");
const entry = await compileDevelopmentEntry(
  path.join(workspaceRoot, "apps/creator-workbench/dev.ts"),
  path.join(workspaceRoot, "apps/creator-workbench/node_modules/.cache/agent-ui-development"),
);
const { startDevelopment } = await import(pathToFileURL(entry).href);
await startDevelopment({
  workspaceRoot,
  args: process.argv.slice(2),
  packages: [...hostPackages, "creator"],
  spawnPnpm,
});
