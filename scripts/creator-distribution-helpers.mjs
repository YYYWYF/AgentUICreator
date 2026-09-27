import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertContractParity } from "../packages/creator/scripts/contract-integrity.mjs";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const pythonRoot = path.join(repositoryRoot, "packages/creator-python");
export const creatorRoot = path.join(repositoryRoot, "packages/creator");
export const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
export const pythonInVenv = (root) => path.join(root, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

export function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`${executable} exited with code ${code}`)));
  });
}

export async function inTemporaryDirectory(work) {
  const temporary = await mkdtemp(path.join(tmpdir(), "agent-ui-creator-distribution-"));
  try { await work(temporary); } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function repositoryPython() {
  const python = process.env.CREATOR_PYTHON_EXECUTABLE?.trim() || pythonInVenv(path.join(pythonRoot, ".venv"));
  try { await access(python); } catch { throw new Error("Run pnpm test:python:setup first, or provide CREATOR_PYTHON_EXECUTABLE as an absolute path."); }
  return python;
}

export const contractSmoke = `
import sys
from pathlib import Path
import agent_ui_creator
from agent_ui_creator.contract_resources import creator_contract_root, read_creator_contract
from agent_ui_creator.project_control.client import ProjectControlClient
package = Path(agent_ui_creator.__file__).resolve().parent
expected = Path(sys.argv[1]).resolve()
assert package.is_relative_to(expected), (package, expected)
assert Path(str(creator_contract_root())).resolve() == package / "_contracts" / "creator"
assert read_creator_contract("project-control.schema.json")["$id"]
ProjectControlClient(project_root=Path.cwd())
print("Packaged Creator contracts and ProjectControl validator initialized.")
`;

export async function unpackCreator(temporary) {
  await run(pnpm, ["-r", "--filter", "@agent-ui/creator...", "build"], { cwd: repositoryRoot });
  await run(pnpm, ["pack", "--pack-destination", temporary], { cwd: creatorRoot });
  const archives = (await readdir(temporary)).filter((name) => name.endsWith(".tgz"));
  assert.equal(archives.length, 1);
  await run("tar", ["-xzf", path.join(temporary, archives[0]), "-C", temporary], { cwd: temporary });
  const unpacked = path.join(temporary, "package");
  for (const file of ["dist/cli.js", "dist/python/agent_ui_creator/server.py", "dist/python/pyproject.toml", "dist/python/requirements.lock", "skills"]) await access(path.join(unpacked, file));
  assert((await readdir(path.join(unpacked, "skills"))).length > 0);
  await assertContractParity(path.join(repositoryRoot, "contracts/creator"), path.join(unpacked, "dist/python/agent_ui_creator/_contracts/creator"));
  return unpacked;
}

export async function sidecarSmoke(unpacked, temporary, environment, pythonExecutable) {
  const { PythonCreatorProcessManager } = await import(pathToFileURL(path.join(unpacked, "dist/PythonCreatorProcessManager.js")).href);
  const manager = new PythonCreatorProcessManager({
    projectRoot: temporary,
    skillsRoot: path.join(unpacked, "skills"),
    pythonPackageRoot: path.join(unpacked, "dist/python"),
    pythonExecutable,
    environment,
    allowExternalEndpoint: false,
    startupTimeoutMs: 60_000,
  });
  try {
    const endpoint = await manager.ensureStarted();
    const response = await fetch(`http://${endpoint.host}:${endpoint.port}/health`, { headers: { Authorization: `Bearer ${endpoint.authToken}` } });
    assert(response.ok);
    assert.equal((await response.json()).runtime, "python");
  } finally { await manager.dispose(); }
}

export function artifactEnvironment(pythonPackageRoot) {
  const environment = { ...process.env, PYTHONPATH: pythonPackageRoot, PYTHONNOUSERSITE: "1" };
  for (const name of ["CREATOR_PYTHON_ENDPOINT", "CREATOR_PYTHON_AUTH_TOKEN", "CREATOR_PYTHON_EXECUTABLE", "CREATOR_PYTHON_AGENT_MODE", "PYTHONHOME", "VIRTUAL_ENV"]) delete environment[name];
  return environment;
}
