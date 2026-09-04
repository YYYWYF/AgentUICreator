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
const creatorEnvironmentPath = path.join(repositoryRoot, ".env.creator.local");
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

export function parseArguments(arguments_) {
  const supportedArguments = new Set(["--live-model", "--setup-only"]);
  const unknownArgument = arguments_.find(
    (argument) => !supportedArguments.has(argument),
  );
  if (unknownArgument) {
    throw new Error(`Unknown argument: ${unknownArgument}`);
  }

  const liveModel = arguments_.includes("--live-model");
  const setupOnly = arguments_.includes("--setup-only");
  if (liveModel && setupOnly) {
    throw new Error("--live-model and --setup-only cannot be used together.");
  }

  return { liveModel, setupOnly };
}

export function createPytestArguments({ liveModel }) {
  if (liveModel) {
    return [
      "-m",
      "pytest",
      "-m",
      "live_model",
      "-s",
      path.join(pythonPackageRoot, "tests", "live"),
    ];
  }

  return ["-m", "pytest", path.join(pythonPackageRoot, "tests")];
}

export function createPytestEnvironment({
  environment = process.env,
  liveModel,
}) {
  return {
    ...environment,
    PYTHONPATH: [pythonPackageRoot, environment.PYTHONPATH]
      .filter(Boolean)
      .join(path.delimiter),
    ...(liveModel ? { CREATOR_RUN_LIVE_MODEL: "1" } : {}),
  };
}

export function parseEnvironmentFile(source) {
  const values = {};
  for (const [index, rawLine] of source.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      throw new Error(
        `.env.creator.local line ${String(index + 1)} is not a valid assignment.`,
      );
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
      throw new Error(
        `.env.creator.local line ${String(index + 1)} has an invalid key.`,
      );
    }
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function mergeEnvironmentFileValues(environment, fileValues) {
  const merged = { ...environment };
  for (const [key, value] of Object.entries(fileValues)) {
    if (!environment[key]?.trim()) {
      merged[key] = value;
    }
  }
  return merged;
}

async function loadLiveModelEnvironment(environment) {
  try {
    const source = await readFile(creatorEnvironmentPath, "utf8");
    return mergeEnvironmentFileValues(
      environment,
      parseEnvironmentFile(source),
    );
  } catch (error) {
    if (error?.code === "ENOENT") {
      return environment;
    }
    throw error;
  }
}

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

export async function main(arguments_ = process.argv.slice(2)) {
  const options = parseArguments(arguments_);
  const requirements = await readFile(requirementsPath);
  const requirementsHash = createHash("sha256")
    .update(requirements)
    .digest("hex");
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

  if (!options.setupOnly) {
    const testEnvironment = options.liveModel
      ? await loadLiveModelEnvironment(process.env)
      : process.env;
    await run(
      virtualEnvironmentPython,
      createPytestArguments(options),
      createPytestEnvironment({ ...options, environment: testEnvironment }),
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
