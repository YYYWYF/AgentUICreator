import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

import { hostPackages, prepareWorkspacePackages } from "./workspace-build-cache.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
/** Explicit workspace preparation, shared by the three real Host command surfaces. */
export function prepareHostPackages({ force = false, withMock = false } = {}) {
  const packages = withMock && existsSync(path.join(workspaceRoot, "packages/creator/package.json"))
    ? [...hostPackages, "creator"] : hostPackages;
  prepareWorkspacePackages(packages, { force });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) prepareHostPackages({ withMock: process.argv.includes("--with-mock") });
