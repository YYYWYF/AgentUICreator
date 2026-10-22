import { spawnPnpmSync } from "../../../scripts/pnpm-process.mjs";
import { fileURLToPath } from "node:url";

// Developer convenience only: the npm entry itself has no TypeScript build.
const result = spawnPnpmSync(["--filter", "@za38.03/agent-ui-operator", "build"], {
  cwd: fileURLToPath(new URL("../../../", import.meta.url)), stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error("Operator build failed");
