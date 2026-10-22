import { spawnSync } from "node:child_process";
import { spawnPnpmSync } from "./pnpm-process.mjs";
import { fileURLToPath } from "node:url";
import { prepareHostPackages } from "./prepare-host-packages.mjs";
import { ensureExampleHost, exampleHosts } from "./prepare-example-host.mjs";
import { pluginResourceViewsReadyEnv, withPluginResourceViews } from "./plugin-resource-views.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
// Always prepare this invocation, even if the caller inherited a Host skip flag.
prepareHostPackages({ force: true, withMock: true });
for (const mode of Object.keys(exampleHosts)) await ensureExampleHost(mode);

let env = { ...process.env };
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args, shell = false) {
  const options = {
    cwd: workspaceRoot,
    stdio: "inherit",
    env,
    shell,
  };
  const result = command === pnpm ? spawnPnpmSync(args, options) : spawnSync(command, args, options);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Workspace TypeScript tests failed: ${command} ${args.join(" ")}`);
}

run(pnpm, ["check:operator-contract"], process.platform === "win32");
run(process.execPath, ["--test", "scripts/run-python-tests.test.mjs", "scripts/pnpm-process.test.mjs", "scripts/ensure-workspace-dependencies.test.mjs", "scripts/check-dependency-pins.test.mjs", "scripts/creator-documentation.test.mjs", "scripts/web-component-preparation.test.mjs", "scripts/prepare-example-host.test.mjs"]);
await withPluginResourceViews(async () => {
  env = { ...env, [pluginResourceViewsReadyEnv]: "1" };
  run(pnpm, ["-r", "--if-present", "test"], process.platform === "win32");
});
