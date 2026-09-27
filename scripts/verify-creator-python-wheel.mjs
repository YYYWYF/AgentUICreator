import assert from "node:assert/strict";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { contractManifest } from "../packages/creator/scripts/contract-integrity.mjs";
import { artifactEnvironment, contractSmoke, inTemporaryDirectory, pythonInVenv, pythonRoot, repositoryPython, repositoryRoot, run } from "./creator-distribution-helpers.mjs";

await inTemporaryDirectory(async (temporary) => {
  const python = await repositoryPython();
  const wheels = path.join(temporary, "wheels");
  await mkdir(wheels);
  const environment = artifactEnvironment("");
  delete environment.PYTHONPATH;
  await run(python, ["-m", "pip", "wheel", "--no-deps", "--wheel-dir", wheels, pythonRoot], { cwd: temporary, env: environment });
  const artifacts = (await readdir(wheels)).filter((name) => name.startsWith("agent_ui_creator_core-") && name.endsWith(".whl"));
  assert.equal(artifacts.length, 1);
  const wheel = path.join(wheels, artifacts[0]);
  const canonical = await contractManifest(path.join(repositoryRoot, "contracts/creator"));
  await run(python, ["-c", `
import hashlib, json, sys, zipfile
prefix = "agent_ui_creator/_contracts/creator/"
with zipfile.ZipFile(sys.argv[1]) as wheel:
    actual = {name[len(prefix):]: hashlib.sha256(wheel.read(name)).hexdigest() for name in wheel.namelist() if name.startswith(prefix) and not name.endswith("/")}
assert actual == json.loads(sys.argv[2]), "Wheel contract files or bytes differ from canonical contracts"
`, wheel, JSON.stringify(canonical)], { cwd: temporary, env: environment });
  const venv = path.join(temporary, "isolated-wheel-venv");
  await run(python, ["-m", "venv", venv], { cwd: temporary, env: environment });
  const installedPython = pythonInVenv(venv);
  await run(installedPython, ["-m", "pip", "install", "--disable-pip-version-check", "-r", path.join(pythonRoot, "requirements.lock")], { cwd: temporary, env: environment });
  await run(installedPython, ["-m", "pip", "install", "--no-deps", wheel], { cwd: temporary, env: environment });
  await run(installedPython, ["-I", "-c", contractSmoke, venv], { cwd: temporary, env: environment });
  console.log("Creator wheel contract parity and isolated installed validator passed.");
});
