import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const pythonPackageRoot = path.join(repositoryRoot, "packages/creator-python");
const requirementsPath = path.join(pythonPackageRoot, "requirements.lock");
const virtualEnvironmentRoot = path.join(pythonPackageRoot, ".venv");
const virtualEnvironmentPython =
  process.platform === "win32"
    ? path.join(virtualEnvironmentRoot, "Scripts", "python.exe")
    : path.join(virtualEnvironmentRoot, "bin", "python");
const requirementsMarker = path.join(
  virtualEnvironmentRoot,
  ".creator-test-requirements.sha256",
);
const bootstrapPython =
  process.env.CREATOR_PYTHON_BOOTSTRAP_EXECUTABLE?.trim() ||
  (process.platform === "win32" ? "python" : "python3");

function run(command, arguments_, environment = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: repositoryRoot,
      env: environment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} exited with code ${String(code)} and signal ${String(signal)}.`,
        ),
      );
    });
  });
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const requirements = await readFile(requirementsPath);
const requirementsHash = createHash("sha256").update(requirements).digest("hex");
const installedHash = (await fileExists(requirementsMarker))
  ? (await readFile(requirementsMarker, "utf8")).trim()
  : undefined;

if (!(await fileExists(virtualEnvironmentPython))) {
  await run(bootstrapPython, [
    "-c",
    "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 'Python 3.11 or newer is required')",
  ]);
  await mkdir(pythonPackageRoot, { recursive: true });
  await run(bootstrapPython, ["-m", "venv", virtualEnvironmentRoot]);
}
await run(virtualEnvironmentPython, [
  "-c",
  "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 'Python 3.11 or newer is required')",
]);
if (installedHash !== requirementsHash) {
  await run(virtualEnvironmentPython, [
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    "-r",
    requirementsPath,
  ]);
  await writeFile(requirementsMarker, `${requirementsHash}\n`, "utf8");
}

if (!process.argv.includes("--setup-only")) {
  await run(
    virtualEnvironmentPython,
    ["-m", "pytest", path.join(pythonPackageRoot, "tests")],
    {
      ...process.env,
      PYTHONPATH: [
        pythonPackageRoot,
        process.env.PYTHONPATH,
      ].filter(Boolean).join(path.delimiter),
    },
  );
}
