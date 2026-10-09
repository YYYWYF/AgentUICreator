import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareHostPackages } from "./prepare-host-packages.mjs";

import { hostPackages, preparationState } from "./preparation-state.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
/** Creator preparation belongs to the development composition, never to a Host. */
export function prepareWorkbench() {
  if (process.env.AGENT_UI_WORKBENCH_PREPARED === preparationState([...hostPackages, "creator"])) return;
  prepareHostPackages();
  const result = spawnSync("pnpm", ["--filter", "@agent-ui/creator", "build"], {
    cwd: workspaceRoot, stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Workbench package preparation failed: Creator");
  process.env.AGENT_UI_WORKBENCH_PREPARED = preparationState([...hostPackages, "creator"]);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) prepareWorkbench();
