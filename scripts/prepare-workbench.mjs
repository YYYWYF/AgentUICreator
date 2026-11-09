import { fileURLToPath } from "node:url";
import { hostPackages, prepareWorkspacePackages } from "./workspace-build-cache.mjs";
/** Creator preparation belongs to the development composition, never to a Host. */
export function prepareWorkbench() {
  return prepareWorkspacePackages([...hostPackages, "creator"]);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) prepareWorkbench();
