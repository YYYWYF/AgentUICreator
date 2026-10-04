import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { creatorPythonCacheRoot, ensureManagedPythonEnvironment, managedPythonExecutable, validateCreatorPython, type PythonCommandRunner } from "../src/python/managed-python-environment.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

async function fixture(failure?: "install" | "smoke" | "venv") {
  const root = await mkdtemp(path.join(tmpdir(), "creator-managed-python-"));
  directories.push(root);
  const pythonPackageRoot = path.join(root, "package");
  await mkdir(pythonPackageRoot);
  await writeFile(path.join(pythonPackageRoot, "requirements.lock"), "fastapi==0.141.1\n");
  const calls: string[][] = [];
  const runner: PythonCommandRunner = async (executable, args) => {
    calls.push([executable, ...args]);
    if (args[1]?.includes("sys.version_info")) return { exitCode: 0, stdout: "[3,12,4]", stderr: "" };
    if (args[1] === "venv") {
      if (failure === "venv") return { exitCode: 1, stdout: "", stderr: "venv unavailable" };
      const directory = args[2]!;
      const python = managedPythonExecutable(directory, "linux");
      await mkdir(path.dirname(python), { recursive: true });
      await writeFile(python, "fake interpreter");
    }
    if ((failure === "install" && args[1] === "pip") || (failure === "smoke" && args[1]?.includes("import fastapi"))) {
      return { exitCode: 1, stdout: "", stderr: "token=super-secret-token https://user:password@example.com/simple" };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  return { root, calls, options: { pythonPackageRoot, environment: { CREATOR_PYTHON_ENV_ROOT: path.join(root, "cache"), API_KEY: "super-secret-token" }, platform: "linux" as const, architecture: "x64", creatorVersion: "0.1.0", runner, bootstrapCandidates: ["python3"] } };
}

describe("managed Creator Python environment", () => {
  it("bootstraps once, writes identity, and reuses the ready environment", async () => {
    const { options, calls } = await fixture();
    const executable = await ensureManagedPythonEnvironment(options);
    expect(executable).toContain("/0.1.0/py3.12-linux-x64/");
    expect(calls.filter((call) => call[2] === "venv")).toHaveLength(1);
    expect(calls.filter((call) => call[2] === "pip")).toHaveLength(1);
    expect(JSON.parse(await readFile(path.join(path.dirname(path.dirname(executable)), ".ready.json"), "utf8"))).toMatchObject({ creatorVersion: "0.1.0", pythonVersion: "3.12.4" });
    expect(await ensureManagedPythonEnvironment(options)).toBe(executable);
    expect(calls.filter((call) => call[2] === "pip")).toHaveLength(1);
  });

  it("selects a new cache entry when requirements change", async () => {
    const { options } = await fixture();
    const first = await ensureManagedPythonEnvironment(options);
    await writeFile(path.join(options.pythonPackageRoot, "requirements.lock"), "changed dependency bytes");
    expect(await ensureManagedPythonEnvironment(options)).not.toBe(first);
  });

  it.each(["install", "smoke", "venv"] as const)("cleans a failed %s transaction and redacts diagnostics", async (failure) => {
    const { options } = await fixture(failure);
    try { await ensureManagedPythonEnvironment(options); throw new Error("Expected setup failure"); } catch (error) {
      const details = JSON.stringify(error);
      expect(details).not.toContain("super-secret-token");
      expect(details).not.toContain("user:password");
      expect(error).toMatchObject({ code: failure === "install" ? "CREATOR_PYTHON_DEPENDENCY_INSTALL_FAILED" : failure === "smoke" ? "CREATOR_PYTHON_ENVIRONMENT_INVALID" : "CREATOR_PYTHON_ENVIRONMENT_SETUP_FAILED" });
    }
    const versionRoot = path.join(options.environment.CREATOR_PYTHON_ENV_ROOT, "0.1.0", "py3.12-linux-x64");
    for (const entry of await readdir(versionRoot)) expect(await readdir(path.join(versionRoot, entry))).toEqual([]);
  });

  it("serializes concurrent writers", async () => {
    const { options, calls } = await fixture();
    const results = await Promise.all([ensureManagedPythonEnvironment(options), ensureManagedPythonEnvironment(options)]);
    expect(results[0]).toBe(results[1]);
    expect(calls.filter((call) => call[2] === "pip")).toHaveLength(1);
  });

  it("does not accept a corrupt ready marker", async () => {
    const { options, calls } = await fixture();
    const executable = await ensureManagedPythonEnvironment(options);
    await writeFile(path.join(path.dirname(path.dirname(executable)), ".ready.json"), "{}");
    await ensureManagedPythonEnvironment(options);
    expect(calls.filter((call) => call[2] === "pip")).toHaveLength(2);
  });

  it("reports a ready environment with broken imports without reinstalling it", async () => {
    const { options, calls } = await fixture();
    await ensureManagedPythonEnvironment(options);
    const original = options.runner;
    options.runner = async (executable, args, commandOptions) => args[1]?.includes("import fastapi")
      ? { exitCode: 1, stdout: "", stderr: "ModuleNotFoundError" }
      : original(executable, args, commandOptions);
    await expect(ensureManagedPythonEnvironment(options)).rejects.toMatchObject({ code: "CREATOR_PYTHON_ENVIRONMENT_INVALID" });
    expect(calls.filter((call) => call[2] === "pip")).toHaveLength(1);
  });

  it("separates Creator versions and architectures", async () => {
    const { options } = await fixture();
    const first = await ensureManagedPythonEnvironment(options);
    expect(await ensureManagedPythonEnvironment({ ...options, creatorVersion: "0.2.0" })).not.toBe(first);
    expect(await ensureManagedPythonEnvironment({ ...options, architecture: "arm64" })).not.toBe(first);
  });

  it("rejects an old bootstrap Python", async () => {
    const { options } = await fixture();
    options.runner = async () => ({ exitCode: 0, stdout: "[3,10,1]", stderr: "" });
    await expect(ensureManagedPythonEnvironment(options)).rejects.toMatchObject({ code: "CREATOR_PYTHON_BOOTSTRAP_RUNTIME_MISSING" });
  });

  it("validates a configured interpreter without venv or pip", async () => {
    const { options, calls } = await fixture();
    await validateCreatorPython("/user/python", { ...options, importSmoke: true });
    expect(calls.every((call) => call[1] === "-c")).toBe(true);
  });

  it("resolves platform cache defaults and an override", () => {
    expect(creatorPythonCacheRoot({ HOME: "/home/user" }, "darwin")).toBe("/home/user/Library/Caches/agent-ui-creator/python");
    expect(creatorPythonCacheRoot({ XDG_CACHE_HOME: "/cache" }, "linux")).toBe("/cache/agent-ui-creator/python");
    expect(creatorPythonCacheRoot({ LOCALAPPDATA: "C:/Local" }, "win32")).toBe(path.join("C:/Local", "agent-ui-creator", "python"));
    expect(creatorPythonCacheRoot({ CREATOR_PYTHON_ENV_ROOT: "/override" })).toBe(path.resolve("/override"));
  });
});
