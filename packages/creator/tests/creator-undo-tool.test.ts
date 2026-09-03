import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CreatorActivityRecorder,
  ProjectCommandBackend,
  ProjectCreatorBackend,
  executeCreatorUndo,
} from "../src/index.js";

const temporaryProjects: string[] = [];

async function createProject(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "creator-undo-tool-"));
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "plugins"));
  await writeFile(path.join(projectRoot, "plugins", "sample.ts"), "before\n");
  await writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({
      scripts: {
        "verify:ui": "node -e \"console.log('ui ok')\"",
        typecheck: "node -e \"console.log('types ok')\"",
      },
    }),
  );
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

describe("undo_creator_run", () => {
  it("restores a completed run, validates the result, and records undo separately", async () => {
    const projectRoot = await createProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const files = new ProjectCreatorBackend({ projectRoot, activity });
    activity.begin("original-run");
    await files.read("/plugins/sample.ts");
    await files.edit("/plugins/sample.ts", "before", "after");
    await files.write("/plugins/created.ts", "created\n");
    const originalReceipt = await activity.finish();

    activity.begin("undo-run");
    const commands = new ProjectCommandBackend({ projectRoot, activity });
    const output = JSON.parse(
      await executeCreatorUndo(activity, commands, { runId: "original-run" }),
    ) as {
      ok: boolean;
      result: {
        undoneRunId: string;
        validations: Array<{ command: string; status: string }>;
      };
    };
    const undoReceipt = await activity.finish();

    expect(originalReceipt.transaction).toEqual({
      runId: "original-run",
      undoable: true,
    });
    expect(output).toMatchObject({
      ok: true,
      result: {
        undoneRunId: "original-run",
        validations: [
          { command: "pnpm verify:ui", status: "passed" },
          { command: "pnpm typecheck", status: "passed" },
        ],
      },
    });
    await expect(
      readFile(path.join(projectRoot, "plugins", "sample.ts"), "utf8"),
    ).resolves.toBe("before\n");
    await expect(
      readFile(path.join(projectRoot, "plugins", "created.ts"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(undoReceipt.transaction).toEqual({
      runId: "undo-run",
      undoable: true,
    });
    expect(undoReceipt.files).toEqual([
      expect.objectContaining({
        path: "plugins/created.ts",
        status: "deleted",
      }),
      expect.objectContaining({
        path: "plugins/sample.ts",
        status: "modified",
      }),
    ]);
    expect(undoReceipt.validations).toEqual([
      expect.objectContaining({ command: "pnpm verify:ui", revision: 2 }),
      expect.objectContaining({ command: "pnpm typecheck", revision: 2 }),
    ]);
  });
});
