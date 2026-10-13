import { spawnPnpmSync } from "./pnpm-process.mjs";
import { fileURLToPath } from "node:url";
import { prepareHostPackages } from "./prepare-host-packages.mjs";

// Consumers read package declarations. Prepare them once before recursive checks,
// so Host pretypecheck hooks cannot concurrently rewrite the same dist directories.
prepareHostPackages({ force: true });
// Vue and plain HTML consumers read the bridge's built public declarations.
const bridge = spawnPnpmSync(["--filter", "@agentui/web-component", "build"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "inherit",
  env: { ...process.env },
});
if (bridge.error) throw bridge.error;
if (bridge.status !== 0) throw new Error("Web Component declaration preparation failed");
const result = spawnPnpmSync(["-r", "--no-bail", "--if-present", "typecheck"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  stdio: "inherit",
  env: { ...process.env },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
