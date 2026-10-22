import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { spawnPnpm } from "./pnpm-process.mjs";
import { ensureWorkspaceDependencies } from "./ensure-workspace-dependencies.mjs";
import { prepareWorkbench } from "./prepare-workbench.mjs";
import { ensureExampleHost, exampleHosts } from "./prepare-example-host.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const modes = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(exampleHosts);
if (new Set(modes).size !== modes.length || modes.some(mode => !Object.hasOwn(exampleHosts, mode))) {
  throw new Error("Usage: pnpm dev:examples [platform|assistant|embedded ...]");
}
ensureWorkspaceDependencies();
prepareWorkbench();
for (const mode of modes) await ensureExampleHost(mode);
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (process.platform === "win32" && child.pid) execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    else child.kill("SIGTERM");
  }
}
for (const mode of modes) {
  const { directory, port } = exampleHosts[mode];
  const child = spawnPnpm(["--filter", `@za38.03/agent-ui-${directory}`, "dev"], { cwd: root, env: process.env, stdio: "inherit" });
  children.push(child);
  child.on("error", error => { console.error(error); stop(1); });
  child.on("exit", code => stop(code ?? 1));
  console.log(`[Agent UI] ${mode}: http://127.0.0.1:${port}/ (${directory})`);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
