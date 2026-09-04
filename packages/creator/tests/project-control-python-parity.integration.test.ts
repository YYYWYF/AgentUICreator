import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ProjectControlAdapter } from "../src/index.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const projectRoot = path.join(repositoryRoot, "examples/agent-frontend");
const pythonPackageRoot = path.join(repositoryRoot, "packages/creator-python");
const managedPython =
  process.platform === "win32"
    ? path.join(pythonPackageRoot, ".venv", "Scripts", "python.exe")
    : path.join(pythonPackageRoot, ".venv", "bin", "python");
const pythonExecutable =
  process.env.CREATOR_PYTHON_EXECUTABLE?.trim() ||
  (existsSync(managedPython)
    ? managedPython
    : process.platform === "win32"
      ? "python"
      : "python3");
const skipIntegration = process.env.CREATOR_SKIP_PYTHON_INTEGRATION === "1";

type ReadOperation =
  | "inspect_ui_project"
  | "inspect_app_ui_model"
  | "list_ui_plugins";

function pythonResult(
  operation: ReadOperation,
  input: Record<string, unknown> = {},
): unknown {
  const source = [
    "import asyncio, json, sys",
    "from pathlib import Path",
    "from agent_ui_creator.project_control import ProjectControlClient",
    "client = ProjectControlClient(project_root=Path(sys.argv[1]))",
    "result = asyncio.run(client._request(sys.argv[2], json.loads(sys.argv[3])))",
    "print(json.dumps(result, ensure_ascii=False, separators=(',', ':')))",
  ].join("\n");
  const execution = spawnSync(
    pythonExecutable,
    ["-c", source, projectRoot, operation, JSON.stringify(input)],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        PYTHONPATH: [pythonPackageRoot, process.env.PYTHONPATH]
          .filter(Boolean)
          .join(path.delimiter),
      },
      encoding: "utf8",
      maxBuffer: 2_000_000,
    },
  );
  if (execution.status !== 0) {
    throw new Error(execution.stderr || execution.error?.message || "Python failed");
  }
  return JSON.parse(execution.stdout) as unknown;
}

(skipIntegration ? describe.skip : describe)(
  "Python ProjectControlClient parity",
  () => {
    it.each<ReadOperation>([
      "inspect_ui_project",
      "inspect_app_ui_model",
      "list_ui_plugins",
    ])("matches the TypeScript adapter for %s", async (operation) => {
      const adapter = new ProjectControlAdapter({ projectRoot });

      const typescript = await adapter.request(operation);
      const python = pythonResult(operation);

      expect(python).toEqual(typescript);
    });
  },
);

