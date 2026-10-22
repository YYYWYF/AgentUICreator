import { spawnPnpmSync } from "./pnpm-process.mjs";
import { fileURLToPath } from "node:url";
import { prepareHostPackages } from "./prepare-host-packages.mjs";
import { ensureExampleHost, exampleHosts } from "./prepare-example-host.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
// Always prepare this invocation, even if the caller inherited a Host skip flag.
prepareHostPackages({ force: true });
for (const name of ["@za38.03/agent-ui-creator", "@za38.03/agent-ui-web-component", "@za38.03/agent-ui-web-component-vue3-demo"]) {
  const result = spawnPnpmSync(["--filter", name, "build"], {
    cwd: workspaceRoot,
    stdio: "inherit",
    env: { ...process.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Workspace build failed: ${name}`);
}

for (const mode of Object.keys(exampleHosts)) {
  const host = await ensureExampleHost(mode);
  const result = spawnPnpmSync(["--filter", `@za38.03/agent-ui-${host.directory}`, "build"], { cwd: workspaceRoot, stdio: "inherit", env: { ...process.env } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Example build failed: ${mode}`);
}
