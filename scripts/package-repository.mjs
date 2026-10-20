import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packer = path.join(repositoryRoot, "scripts", "package-repository.py");
const python =
  process.env.AGENT_UI_ARCHIVE_PYTHON?.trim() ||
  (process.platform === "win32" ? "python" : "python3");

const result = spawnSync(python, [packer, ...process.argv.slice(2)], {
  cwd: repositoryRoot,
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) {
  console.error(`Could not start Python executable "${python}": ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
