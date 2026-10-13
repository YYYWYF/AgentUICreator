import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeEnvironmentFileValues, parseEnvironmentFile } from "./run-python-tests.mjs";
import { spawnPnpmSync } from "./pnpm-process.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
const pythonRoot = path.join(workspaceRoot, "packages/creator-python");
const environment = mergeEnvironmentFileValues(process.env, parseEnvironmentFile(
  await readFile(path.join(workspaceRoot, ".env.creator.local"), "utf8"),
));
const token = environment.CREATOR_PYTHON_AUTH_TOKEN;
if (!token?.trim()) throw new Error("CREATOR_PYTHON_AUTH_TOKEN is missing from .env.creator.local");
const endpoint = environment.CREATOR_PYTHON_ENDPOINT || "http://127.0.0.1:8010";
const match = /^http:\/\/127\.0\.0\.1:(\d+)$/u.exec(endpoint);
const port = Number(match?.[1]);
if (!match || port < 1 || port > 65535) throw new Error("CREATOR_PYTHON_ENDPOINT must use http://127.0.0.1:<port> with a valid port");
const python = path.join(pythonRoot, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
try { await access(python); } catch { throw new Error("Missing managed Python runtime. Run: pnpm test:python:setup"); }
const build = spawnPnpmSync(["--filter", "@agent-ui/project-control", "build"], { cwd: workspaceRoot, env: environment, stdio: "inherit" });
if (build.error) throw build.error;
if (build.status !== 0) throw new Error("Project Control build failed");
const serverArgs = ["-m", "agent_ui_creator.server", "--project-root", path.join(workspaceRoot, "examples/creator-host-sandbox"),
  "--skills-root", path.join(workspaceRoot, "packages/creator/skills"), "--config-root", workspaceRoot,
  "--port", String(port), "--auth-token", token];
const args = environment.CREATOR_PYTHON_HOT_RELOAD === "1"
  ? [path.join(pythonRoot, "dev_reload.py"), "--source-root", path.join(pythonRoot, "agent_ui_creator"), "--", python, ...serverArgs]
  : serverArgs;
const child = spawn(python, args, { cwd: pythonRoot, env: environment, stdio: "inherit" });
child.once("error", error => { console.error(error); process.exitCode = 1; });
child.once("exit", code => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
