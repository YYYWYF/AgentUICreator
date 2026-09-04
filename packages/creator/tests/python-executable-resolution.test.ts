import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  resolveConfiguredCreatorPythonExecutable,
  resolveCreatorPythonExecutable,
} from "../src/PythonCreatorProcessManager.js";

const temporaryDirectories: string[] = [];

async function packageRootWithManagedPython(platform: NodeJS.Platform): Promise<{
  packageRoot: string;
  executable: string;
}> {
  const packageRoot = await mkdtemp(path.join(tmpdir(), "creator-python-resolution-"));
  temporaryDirectories.push(packageRoot);
  const executable = path.join(
    packageRoot,
    ".venv",
    platform === "win32" ? "Scripts" : "bin",
    platform === "win32" ? "python.exe" : "python",
  );
  await mkdir(path.dirname(executable), { recursive: true });
  await writeFile(executable, "");
  return { packageRoot, executable };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Creator Python executable resolution", () => {
  it("uses the managed Unix virtual environment when there is no configuration", async () => {
    const fixture = await packageRootWithManagedPython("darwin");

    await expect(
      resolveCreatorPythonExecutable({
        pythonPackageRoot: fixture.packageRoot,
        platform: "darwin",
      }),
    ).resolves.toEqual({
      executable: fixture.executable,
      source: "managed_venv",
    });
  });

  it("uses the managed Windows virtual environment path", async () => {
    const fixture = await packageRootWithManagedPython("win32");

    await expect(
      resolveCreatorPythonExecutable({
        pythonPackageRoot: fixture.packageRoot,
        platform: "win32",
      }),
    ).resolves.toEqual({
      executable: fixture.executable,
      source: "managed_venv",
    });
  });

  it("keeps an explicit executable ahead of an existing managed environment", async () => {
    const fixture = await packageRootWithManagedPython("darwin");

    await expect(
      resolveCreatorPythonExecutable({
        configuredExecutable: "/custom/python",
        pythonPackageRoot: fixture.packageRoot,
        platform: "darwin",
      }),
    ).resolves.toEqual({
      executable: "/custom/python",
      source: "configured",
    });
  });

  it("preserves option, environment, then host-config precedence", () => {
    expect(
      resolveConfiguredCreatorPythonExecutable({
        optionExecutable: "/option/python",
        environmentExecutable: "/env/python",
        hostConfigExecutable: "/config/python",
      }),
    ).toBe("/option/python");
    expect(
      resolveConfiguredCreatorPythonExecutable({
        environmentExecutable: "/env/python",
        hostConfigExecutable: "/config/python",
      }),
    ).toBe("/env/python");
    expect(
      resolveConfiguredCreatorPythonExecutable({
        hostConfigExecutable: "/config/python",
      }),
    ).toBe("/config/python");
  });

  it("falls back to the platform system executable when the managed environment is absent", async () => {
    const packageRoot = await mkdtemp(path.join(tmpdir(), "creator-python-resolution-"));
    temporaryDirectories.push(packageRoot);

    await expect(
      resolveCreatorPythonExecutable({ pythonPackageRoot: packageRoot, platform: "linux" }),
    ).resolves.toEqual({ executable: "python3", source: "system" });
    await expect(
      resolveCreatorPythonExecutable({ pythonPackageRoot: packageRoot, platform: "win32" }),
    ).resolves.toEqual({ executable: "python", source: "system" });
  });
});
