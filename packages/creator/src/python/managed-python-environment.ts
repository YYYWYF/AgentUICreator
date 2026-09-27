import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { PythonCreatorRuntimeError } from "./runtime-error.js";

export interface PythonCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}
export type PythonCommandRunner = (
  executable: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; cwd: string },
) => Promise<PythonCommandResult>;

// Capture bounded output; never report the caller's environment or credentials.
export const runPythonCommand: PythonCommandRunner = (executable, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout = (stdout + chunk.toString()).slice(-8_000); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-8_000); });
    const timer = setTimeout(() => child.kill("SIGKILL"), 20 * 60_000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (exitCode) => { clearTimeout(timer); resolve({ exitCode, stdout, stderr }); });
  });

function sanitizedOutput(output: string, environment: NodeJS.ProcessEnv): string {
  let sanitized = output.replace(/https?:\/\/[^\s]+/gu, "[REDACTED_URL]")
    .replace(/(?:authorization|api[_-]?key|token|password)\s*[:=]\s*[^\s]+/giu, "[REDACTED_SECRET]");
  for (const [name, value] of Object.entries(environment)) {
    if (value && /key|token|secret|password|authorization/iu.test(name)) {
      sanitized = sanitized.split(value).join("[REDACTED_SECRET]");
    }
  }
  return sanitized.slice(-2_000);
}

export function managedPythonExecutable(root: string, platform = process.platform): string {
  return path.join(root, platform === "win32" ? "Scripts" : "bin", platform === "win32" ? "python.exe" : "python");
}

export function creatorPythonCacheRoot(environment: NodeJS.ProcessEnv, platform = process.platform): string {
  if (environment.CREATOR_PYTHON_ENV_ROOT?.trim()) return path.resolve(environment.CREATOR_PYTHON_ENV_ROOT.trim());
  const home = environment.HOME || environment.USERPROFILE || homedir();
  const base = platform === "darwin" ? path.join(home, "Library", "Caches")
    : platform === "win32" ? environment.LOCALAPPDATA || path.join(home, "AppData", "Local")
      : environment.XDG_CACHE_HOME || path.join(home, ".cache");
  return path.join(base, "agent-ui-creator", "python");
}

const VERSION_PROBE = "import json, sys; print(json.dumps(list(sys.version_info[:3])))";
const IMPORT_SMOKE = "import fastapi, pydantic, ag_ui, langchain_openai, langgraph, deepagents; import agent_ui_creator.server";

function isolatedEnvironment(environment: NodeJS.ProcessEnv, pythonPackageRoot: string): NodeJS.ProcessEnv {
  const isolated: NodeJS.ProcessEnv = { ...environment, PYTHONPATH: pythonPackageRoot, PYTHONNOUSERSITE: "1" };
  for (const name of ["PYTHONHOME", "VIRTUAL_ENV", "PIP_TARGET", "PIP_PREFIX", "PIP_USER"]) delete isolated[name];
  return isolated;
}

export async function validateCreatorPython(
  executable: string,
  options: { pythonPackageRoot: string; environment?: NodeJS.ProcessEnv | undefined; runner?: PythonCommandRunner | undefined; importSmoke?: boolean | undefined },
): Promise<string> {
  const environment = options.environment ?? process.env;
  const runner = options.runner ?? runPythonCommand;
  const commandOptions = { cwd: options.pythonPackageRoot, env: isolatedEnvironment(environment, options.pythonPackageRoot) };
  try {
    const result = await runner(executable, ["-c", VERSION_PROBE], commandOptions);
    const version: unknown = JSON.parse(result.stdout);
    if (result.exitCode !== 0 || !Array.isArray(version) || version.length !== 3 ||
      !version.every((part: unknown) => Number.isInteger(part)) || version[0] !== 3 || version[1] < 11) throw new Error("Python 3.11+ is required.");
    if (options.importSmoke) {
      const imported = await runner(executable, ["-c", IMPORT_SMOKE], commandOptions);
      if (imported.exitCode !== 0) throw new PythonCreatorRuntimeError(
        "CREATOR_PYTHON_ENVIRONMENT_INVALID",
        "Configured Creator Python environment is missing runtime dependencies or cannot import the packaged runtime.",
        { executable, exitCode: imported.exitCode, stderr: sanitizedOutput(imported.stderr, environment) },
      );
    }
    return version.join(".");
  } catch (error) {
    if (error instanceof PythonCreatorRuntimeError) throw error;
    throw new PythonCreatorRuntimeError("CREATOR_PYTHON_BOOTSTRAP_RUNTIME_MISSING", "A working Python 3.11+ interpreter is required.", { executable });
  }
}

export interface ManagedPythonEnvironmentOptions {
  pythonPackageRoot: string;
  environment?: NodeJS.ProcessEnv | undefined;
  platform?: NodeJS.Platform | undefined;
  architecture?: string | undefined;
  creatorVersion?: string | undefined;
  runner?: PythonCommandRunner | undefined;
  bootstrapCandidates?: string[] | undefined;
  lockTimeoutMs?: number | undefined;
}

export async function ensureManagedPythonEnvironment(options: ManagedPythonEnvironmentOptions): Promise<string> {
  const { pythonPackageRoot } = options;
  const environment = options.environment ?? process.env;
  const platform = options.platform ?? process.platform;
  const architecture = options.architecture ?? process.arch;
  const runner = options.runner ?? runPythonCommand;
  const creatorVersion = options.creatorVersion ?? (JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;
  const requirementsPath = path.join(pythonPackageRoot, "requirements.lock");
  let requirementsSha256: string;
  try { requirementsSha256 = createHash("sha256").update(await readFile(requirementsPath)).digest("hex"); }
  catch { throw new PythonCreatorRuntimeError("CREATOR_PYTHON_ENVIRONMENT_SETUP_FAILED", "Packaged Python requirements.lock is unavailable.", { requirementsPath }); }
  let bootstrap: string | undefined;
  let pythonVersion: string | undefined;
  for (const candidate of options.bootstrapCandidates ?? (platform === "win32" ? ["python", "python3"] : ["python3", "python"])) {
    try {
      pythonVersion = await validateCreatorPython(candidate, { pythonPackageRoot, environment, runner });
      bootstrap = candidate;
      break;
    } catch { /* Try the next bootstrap interpreter, never use it as the sidecar runtime. */ }
  }
  if (!bootstrap || !pythonVersion) throw new PythonCreatorRuntimeError("CREATOR_PYTHON_BOOTSTRAP_RUNTIME_MISSING", "Install Python 3.11+ or configure CREATOR_PYTHON_EXECUTABLE.");
  const pythonMinor = pythonVersion.split(".").slice(0, 2).join(".");
  const root = path.join(creatorPythonCacheRoot(environment, platform), creatorVersion, `py${pythonMinor}-${platform}-${architecture}`, requirementsSha256);
  const finalEnvironment = path.join(root, "venv");
  const executable = managedPythonExecutable(finalEnvironment, platform);
  const identity = { schemaVersion: 1, creatorVersion, pythonVersion, requirementsSha256, platform, architecture };
  async function ready(): Promise<boolean> {
    try {
      const marker = JSON.parse(await readFile(path.join(finalEnvironment, ".ready.json"), "utf8")) as Record<string, unknown>;
      if (marker.schemaVersion !== 1 || marker.creatorVersion !== creatorVersion || marker.requirementsSha256 !== requirementsSha256 ||
        marker.platform !== platform || marker.architecture !== architecture || typeof marker.pythonVersion !== "string" ||
        marker.pythonVersion.split(".").slice(0, 2).join(".") !== pythonMinor || typeof marker.createdAt !== "string") return false;
      await access(executable);
      return true;
    } catch { return false; }
  }
  async function validateReady(): Promise<string> {
    try {
      await validateCreatorPython(executable, { pythonPackageRoot, environment, runner, importSmoke: true });
    } catch (error) {
      throw new PythonCreatorRuntimeError("CREATOR_PYTHON_ENVIRONMENT_INVALID", "Cached Creator Python environment is invalid. Remove this cache entry and retry.", { executable, cause: error instanceof PythonCreatorRuntimeError ? error.details : undefined });
    }
    return executable;
  }
  if (await ready()) return validateReady();
  try { await mkdir(root, { recursive: true }); }
  catch { throw new PythonCreatorRuntimeError("CREATOR_PYTHON_ENVIRONMENT_SETUP_FAILED", "Cannot create the Creator Python cache directory.", { root }); }
  const lock = path.join(root, ".bootstrap-lock");
  const deadline = Date.now() + (options.lockTimeoutMs ?? 25 * 60_000);
  while (true) {
    try { await mkdir(lock); break; } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new PythonCreatorRuntimeError("CREATOR_PYTHON_ENVIRONMENT_SETUP_FAILED", "Cannot acquire the Creator Python bootstrap lock.", { lock });
      if (await ready()) return validateReady();
      if (Date.now() >= deadline) throw new PythonCreatorRuntimeError("CREATOR_PYTHON_ENVIRONMENT_SETUP_FAILED", "Timed out waiting for Python environment bootstrap. If no Creator process is running, remove the bootstrap lock and retry.", { lock });
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
    }
  }
  const temporary = path.join(root, `venv.tmp-${randomUUID()}`);
  const commandOptions = { cwd: pythonPackageRoot, env: isolatedEnvironment(environment, pythonPackageRoot) };
  async function command(executable: string, args: string[], code: string): Promise<void> {
    try {
      const result = await runner(executable, args, commandOptions);
      if (result.exitCode !== 0) throw new PythonCreatorRuntimeError(code, "Creator Python environment bootstrap failed.", {
        executable, requirementsPath, exitCode: result.exitCode, stderr: sanitizedOutput(result.stderr, environment),
      });
    } catch (error) {
      if (error instanceof PythonCreatorRuntimeError) throw error;
      throw new PythonCreatorRuntimeError(code, "Unable to run Python environment bootstrap command.", { executable, requirementsPath });
    }
  }
  try {
    if (await ready()) return await validateReady();
    // Only incomplete entries are replaced, under the exclusive writer lock.
    await rm(finalEnvironment, { recursive: true, force: true });
    await command(bootstrap, ["-m", "venv", temporary], "CREATOR_PYTHON_ENVIRONMENT_SETUP_FAILED");
    const temporaryPython = managedPythonExecutable(temporary, platform);
    await command(temporaryPython, ["-m", "pip", "install", "--disable-pip-version-check", "--no-user", "--prefix", temporary, "-r", requirementsPath], "CREATOR_PYTHON_DEPENDENCY_INSTALL_FAILED");
    await command(temporaryPython, ["-c", IMPORT_SMOKE], "CREATOR_PYTHON_ENVIRONMENT_INVALID");
    await writeFile(path.join(temporary, ".ready.json"), JSON.stringify({ ...identity, createdAt: new Date().toISOString() }));
    await rename(temporary, finalEnvironment);
    try { return await validateReady(); } catch (error) {
      await rm(finalEnvironment, { recursive: true, force: true });
      throw error;
    }
  } catch (error) {
    if (error instanceof PythonCreatorRuntimeError) throw error;
    throw new PythonCreatorRuntimeError("CREATOR_PYTHON_ENVIRONMENT_SETUP_FAILED", "Cannot commit the Creator Python environment.", { executable, requirementsPath });
  } finally {
    await rm(temporary, { recursive: true, force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
