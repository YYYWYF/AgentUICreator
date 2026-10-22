import { execFile } from "node:child_process";
import { spawnPnpm } from "./pnpm-process.mjs";
import { fileURLToPath } from "node:url";
import { ensureWorkspaceDependencies } from "./ensure-workspace-dependencies.mjs";
import { prepareWorkbench } from "./prepare-workbench.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
function port(option, fallback) {
  const index = args.indexOf(option);
  const value = index === -1 ? fallback : Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`Invalid ${option}`);
  return value;
}
const hostPort = port("--host-port", 5180);
const workbenchPort = port("--workbench-port", 5174);
ensureWorkspaceDependencies();
prepareWorkbench();
await import("./prepare-platform-host.mjs");
const environment = {
  ...process.env,
  VITE_CREATOR_DOCK_URL: process.env.VITE_CREATOR_DOCK_URL || `http://127.0.0.1:${workbenchPort}/dock.html`,
  VITE_CREATOR_HOST_PREVIEW_URL: process.env.VITE_CREATOR_HOST_PREVIEW_URL || `http://127.0.0.1:${hostPort}/?creator-preview`,
};
const children = [
  ["@za38.03/agent-ui-creator-host-sandbox", hostPort, ["--config", fileURLToPath(new URL("../apps/creator-workbench/host-preview.vite.config.ts", import.meta.url))]],
  ["@za38.03/agent-ui-creator-workbench", workbenchPort, []],
].map(([name, listenPort, configArgs]) => spawnPnpm(["--filter", String(name), "dev", ...configArgs, "--host", "127.0.0.1", "--port", String(listenPort), "--strictPort"], {
  cwd: workspaceRoot, env: environment, stdio: "inherit",
}));
console.log(`[Creator] Platform + Creator Agent: http://127.0.0.1:${hostPort}/`);
console.log(`[Creator] Workbench: http://127.0.0.1:${workbenchPort}/`);
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
for (const child of children) {
  child.on("error", error => { console.error(error); stop(1); });
  child.on("exit", code => stop(code ?? 1));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
