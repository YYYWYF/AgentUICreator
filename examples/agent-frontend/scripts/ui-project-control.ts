/** Legacy entry. Remove after one migration cycle and managed-entry Host coverage passes. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runUIProjectControlCli } from "../../../packages/project-control/src/handler";
export * from "../../../packages/project-control/src/handler";
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runUIProjectControlCli(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
}
