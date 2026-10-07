import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareHostPackages } from "./prepare-host-packages.mjs";

// Consumers read package declarations. Prepare them once before recursive checks,
// so Host pretypecheck hooks cannot concurrently rewrite the same dist directories.
prepareHostPackages({ force: true });
// Vue and plain HTML consumers read the bridge's built public declarations.
const bridge = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--filter", "@agentui/web-component", "build"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "inherit",
  shell: process.platform === "win32", env: { ...process.env, AGENT_UI_HOST_PACKAGES_PREPARED: "1" },
});
if (bridge.error) throw bridge.error;
if (bridge.status !== 0) throw new Error("Web Component declaration preparation failed");
const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["-r", "--no-bail", "--if-present", "typecheck"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, AGENT_UI_HOST_PACKAGES_PREPARED: "1" },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
