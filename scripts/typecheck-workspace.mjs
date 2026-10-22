import { prepareTypeScriptAuthoring, typescriptAuthoringReadyEnv } from "./prepare-typescript-authoring.mjs";
import { spawnPnpmSync } from "./pnpm-process.mjs";
import { fileURLToPath } from "node:url";
import { prepareHostPackages } from "./prepare-host-packages.mjs";

// Consumers read package declarations. Prepare them once before recursive checks,
// so Host pretypecheck hooks cannot concurrently rewrite the same dist directories.
await prepareTypeScriptAuthoring();
prepareHostPackages({ force: true, withMock: true });
// Vue and plain HTML consumers read the bridge's built public declarations.
const bridge = spawnPnpmSync(["--filter", "@za38.03/agent-ui-web-component", "build"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "inherit",
  env: { ...process.env },
});
if (bridge.error) throw bridge.error;
if (bridge.status !== 0) throw new Error("Web Component declaration preparation failed");
process.exitCode = await (async () => {
  const result = spawnPnpmSync(["-r", "--workspace-concurrency=1", "--no-bail", "--if-present", "typecheck"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "inherit",
    env: { ...process.env, [typescriptAuthoringReadyEnv]: "1" },
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
})();
