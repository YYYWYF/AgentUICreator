import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareHostPackages } from "./prepare-host-packages.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
// Always prepare this invocation, even if the caller inherited a Host skip flag.
prepareHostPackages({ force: true });

const env = { ...process.env, AGENT_UI_HOST_PACKAGES_PREPARED: "1" };
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args, shell = false) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    stdio: "inherit",
    env,
    shell,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Workspace TypeScript tests failed: ${command} ${args.join(" ")}`);
}

run(pnpm, ["check:project-control-contract"], process.platform === "win32");
run(process.execPath, ["--test", "scripts/run-python-tests.test.mjs"]);
run(pnpm, ["-r", "--if-present", "test"], process.platform === "win32");
