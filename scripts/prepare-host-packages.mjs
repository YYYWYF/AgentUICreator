import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
/** Explicit workspace preparation, shared by the three real Host command surfaces. */
export function prepareHostPackages() {
  if (process.env.AGENT_UI_HOST_PACKAGES_PREPARED === "1") return;
  for (const name of ["runtime-core", "react", "runtime-conversation", "runtime-react", "source-registry", "bootstrap", "mock-agent", "project-control", "creator"]) {
    const result = spawnSync("pnpm", ["--filter", `@agent-ui/${name}`, "build"], { cwd: workspaceRoot, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Host package preparation failed: @agent-ui/${name}`);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) prepareHostPackages();
