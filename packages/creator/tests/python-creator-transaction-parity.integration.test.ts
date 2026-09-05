import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  CREATOR_MISSING_FILE_HASH,
  CreatorActivityRecorder,
  CreatorTransactionStore,
  creatorContentHash,
} from "../src/index.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
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
const temporaryDirectories: string[] = [];

function python(source: string, ...args: string[]): unknown {
  const result = spawnSync(pythonExecutable, ["-c", source, ...args], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PYTHONPATH: [pythonPackageRoot, process.env.PYTHONPATH]
        .filter(Boolean)
        .join(path.delimiter),
    },
    encoding: "utf8",
    maxBuffer: 6_000_000,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || "Python failed");
  }
  return JSON.parse(result.stdout) as unknown;
}

async function projectFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "creator-transaction-parity-"));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, "plugins"));
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

(skipIntegration ? describe.skip : describe)(
  "Python Creator transaction parity",
  () => {
    it("uses the same content and missing-file hashes", () => {
      const result = python(
        [
          "import json",
          "from agent_ui_creator.files import CREATOR_MISSING_FILE_HASH, creator_content_hash",
          "print(json.dumps({'hello': creator_content_hash('hello'), 'missing': CREATOR_MISSING_FILE_HASH}))",
        ].join("\n"),
      ) as { hello: string; missing: string };

      expect(result.hello).toBe(creatorContentHash("hello"));
      expect(result.missing).toBe(CREATOR_MISSING_FILE_HASH);
    });

    it("loads and undoes a Python transaction from TypeScript", async () => {
      const projectRoot = await projectFixture();
      const target = path.join(projectRoot, "plugins/activity.ts");
      await writeFile(target, 'export const activity = "old";\n');
      const receipt = python(
        [
          "import json, sys",
          "from pathlib import Path",
          "from agent_ui_creator.activity import CreatorActivityRecorder",
          "from agent_ui_creator.minimal_agent.path_policy import MinimalAgentPathPolicy, PolicyFilesystemBackend",
          "root = Path(sys.argv[1])",
          "activity = CreatorActivityRecorder(root)",
          "activity.begin('python-run')",
          "backend = PolicyFilesystemBackend(root, MinimalAgentPathPolicy.development(), activity=activity)",
          "assert backend.read('/plugins/activity.ts').error is None",
          "assert backend.edit('/plugins/activity.ts', '\"old\"', '\"new\"').error is None",
          "print(json.dumps(activity.finish(), ensure_ascii=False))",
        ].join("\n"),
        projectRoot,
      ) as { transaction: { runId: string; undoable: boolean } };

      const store = new CreatorTransactionStore(projectRoot);
      const record = await store.load("python-run");
      expect(receipt.transaction).toEqual({ runId: "python-run", undoable: true });
      expect(record).toMatchObject({
        schemaVersion: 1,
        runId: "python-run",
        mutationRevision: 1,
        validationRevision: null,
      });
      await store.undo("python-run");
      expect(await readFile(target, "utf8")).toContain('"old"');
    });

    it("loads, checks, and undoes a TypeScript transaction from Python", async () => {
      const projectRoot = await projectFixture();
      const target = path.join(projectRoot, "plugins/activity.ts");
      await writeFile(target, 'export const activity = "old";\n');
      const activity = new CreatorActivityRecorder(projectRoot);
      activity.begin("typescript-run");
      await activity.captureBefore("plugins/activity.ts");
      await writeFile(target, 'export const activity = "new";\n');
      activity.touch("plugins/activity.ts");
      await activity.finish();

      const result = python(
        [
          "import json, sys",
          "from agent_ui_creator.transactions import CreatorTransactionStore",
          "store = CreatorTransactionStore(sys.argv[1])",
          "record = store.load('typescript-run')",
          "status = store.status('typescript-run')",
          "undo = store.undo('typescript-run')",
          "print(json.dumps({'record': record.to_dict(), 'status': status.to_dict(), 'undo': undo.to_dict()}, ensure_ascii=False))",
        ].join("\n"),
        projectRoot,
      ) as {
        record: { schemaVersion: number; validationRevision: null };
        status: { undoable: boolean };
        undo: { changedPaths: string[] };
      };

      expect(result.record).toMatchObject({
        schemaVersion: 1,
        validationRevision: null,
      });
      expect(result.status.undoable).toBe(true);
      expect(result.undo.changedPaths).toEqual(["plugins/activity.ts"]);
      expect(await readFile(target, "utf8")).toContain('"old"');
    });
  },
);
