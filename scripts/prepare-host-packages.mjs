import { publicPackageName } from "./build-public-packages.mjs";
import { spawnPnpmSync } from "./pnpm-process.mjs";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

import { hostPackages, preparationState } from "./preparation-state.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
/** Explicit workspace preparation, shared by the three real Host command surfaces. */
export function prepareHostPackages({ force = false, withMock = false } = {}) {
  const packages = withMock && existsSync(path.join(workspaceRoot, "packages/creator/package.json"))
    ? [...hostPackages, "creator"] : hostPackages;
  if (!force && process.env.AGENT_UI_HOST_PACKAGES_PREPARED === preparationState(packages)) return;
  for (const name of packages) {
    const result = spawnPnpmSync(["--filter", publicPackageName(name), "build"], { cwd: workspaceRoot, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Host package preparation failed: ${publicPackageName(name)}`);
  }
  process.env.AGENT_UI_HOST_PACKAGES_PREPARED = preparationState(packages);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) prepareHostPackages({ withMock: process.argv.includes("--with-mock") });
