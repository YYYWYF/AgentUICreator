import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareHostPackages } from "./prepare-host-packages.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
// Always prepare this invocation, even if the caller inherited a Host skip flag.
prepareHostPackages({ force: true });
for (const name of ["@agent-ui/creator", "@agent-ui/creator-host-sandbox", "@agent-ui/creator-assistant-host", "@agent-ui/creator-embedded-host", "@agentui/web-component", "@agent-ui/web-component-vue3-demo", "@agent-ui/web-component-legacy-demo"]) {
  const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--filter", name, "build"], {
    cwd: workspaceRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, AGENT_UI_HOST_PACKAGES_PREPARED: "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Workspace build failed: ${name}`);
}
