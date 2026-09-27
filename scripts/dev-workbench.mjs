import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareWorkbench } from "./prepare-workbench.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
function port(option, fallback) {
  const index = args.indexOf(option);
  const value = index === -1 ? fallback : Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`Invalid ${option}`);
  return value;
}
const hostPort = port("--host-port", 5176);
const workbenchPort = port("--workbench-port", 5174);
prepareWorkbench();
const environment = {
  ...process.env,
  AGENT_UI_HOST_PACKAGES_PREPARED: "1",
  AGENT_UI_WORKBENCH_PREPARED: "1",
  VITE_CREATOR_HOST_PREVIEW_URL: process.env.VITE_CREATOR_HOST_PREVIEW_URL || `http://127.0.0.1:${hostPort}/?creator-preview`,
};
const ensure = spawnSync("pnpm", ["--filter", "@agent-ui/creator-host-sandbox", "exec", "node", "--import", "tsx", "../../scripts/host-examples/host-project.ts", "ensure", "platform", "creator-host-sandbox"], {
  cwd: workspaceRoot, env: environment, stdio: "inherit",
});
if (ensure.error) throw ensure.error;
if (ensure.status !== 0) throw new Error("Could not prepare the platform Host");
const children = [
  ["@agent-ui/creator-host-sandbox", hostPort, ["--config", fileURLToPath(new URL("../apps/creator-workbench/host-preview.vite.config.ts", import.meta.url))]],
  ["@agent-ui/creator-workbench", workbenchPort, []],
].map(([name, listenPort, configArgs]) => spawn("pnpm", ["--filter", String(name), "dev", ...configArgs, "--host", "127.0.0.1", "--port", String(listenPort), "--strictPort"], {
  cwd: workspaceRoot, env: environment, stdio: "inherit",
}));
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
}
for (const child of children) {
  child.on("error", error => { console.error(error); stop(1); });
  child.on("exit", code => stop(code ?? 1));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
