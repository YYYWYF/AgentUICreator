import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { hostPackages, preparationState } from "./preparation-state.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
/** Explicit workspace preparation, shared by the three real Host command surfaces. */
export function prepareHostPackages({ force = false } = {}) {
  if (!force && process.env.AGENT_UI_HOST_PACKAGES_PREPARED === preparationState(hostPackages)) return;
  for (const name of hostPackages) {
    const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--filter", `@agent-ui/${name}`, "build"], { cwd: workspaceRoot, stdio: "inherit", shell: process.platform === "win32" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Host package preparation failed: @agent-ui/${name}`);
  }
  process.env.AGENT_UI_HOST_PACKAGES_PREPARED = preparationState(hostPackages);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) prepareHostPackages();
