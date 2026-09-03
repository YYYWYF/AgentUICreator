import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_CREATOR_TRANSACTION_BYTES,
  CreatorActivityRecorder,
  CreatorTransactionStore,
  ProjectCreatorBackend,
} from "../src/index.js";
import { creatorContentHash } from "../src/files/creatorFileState.js";

const temporaryProjects: string[] = [];

async function createProject(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "creator-transaction-"));
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "plugins"));
  await writeFile(path.join(projectRoot, "plugins", "modified.ts"), "before\n");
  await writeFile(path.join(projectRoot, "plugins", "deleted.ts"), "delete me\n");
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

async function createThreeWayTransaction(projectRoot: string, runId: string) {
  const activity = new CreatorActivityRecorder(projectRoot);
  const backend = new ProjectCreatorBackend({ projectRoot, activity });
  activity.begin(runId);
  await backend.read("/plugins/modified.ts");
  await backend.edit("/plugins/modified.ts", "before", "middle");
  await backend.edit("/plugins/modified.ts", "middle", "after");
  await backend.write("/plugins/created.ts", "created\n");
  await activity.captureBefore("plugins/deleted.ts");
  await unlink(path.join(projectRoot, "plugins", "deleted.ts"));
  activity.touch("plugins/deleted.ts");
  return { activity, receipt: await activity.finish() };
}

describe("CreatorTransactionStore", () => {
  it("keeps the first before state, final after state, and all receipt statuses", async () => {
    const projectRoot = await createProject();
    const { activity, receipt } = await createThreeWayTransaction(
      projectRoot,
      "three-way-run",
    );
    const record = await activity.transactions.load("three-way-run");

    expect(receipt.files.map(({ path: filePath, status }) => [filePath, status])).toEqual([
      ["plugins/created.ts", "created"],
      ["plugins/deleted.ts", "deleted"],
      ["plugins/modified.ts", "modified"],
    ]);
    const modified = record.files.find(
      (file) => file.path === "plugins/modified.ts",
    );
    expect(modified?.before.content).toBe("before\n");
    expect(modified?.after.hash).toBe(creatorContentHash("after\n"));
    expect(record).toMatchObject({
      runId: "three-way-run",
      mutationRevision: 4,
      files: expect.arrayContaining([
        expect.objectContaining({ status: "created" }),
        expect.objectContaining({ status: "modified" }),
        expect.objectContaining({ status: "deleted" }),
      ]),
    });
  });

  it("does not persist a transaction when a run has no net change", async () => {
    const projectRoot = await createProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const backend = new ProjectCreatorBackend({ projectRoot, activity });
    activity.begin("no-net-run");
    await backend.read("/plugins/modified.ts");
    await backend.edit("/plugins/modified.ts", "before", "middle");
    await backend.edit("/plugins/modified.ts", "middle", "before");

    const receipt = await activity.finish();

    expect(receipt.files).toEqual([]);
    expect(receipt.transaction).toBeUndefined();
    await expect(activity.transactions.load("no-net-run")).rejects.toMatchObject({
      code: "CREATOR_TRANSACTION_NOT_FOUND",
    });
  });

  it("keeps finish idempotent and never rebases a completed run onto later edits", async () => {
    const projectRoot = await createProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const backend = new ProjectCreatorBackend({ projectRoot, activity });
    activity.begin("idempotent-finish-run");
    await backend.read("/plugins/modified.ts");
    await backend.edit("/plugins/modified.ts", "before", "after");
    const firstReceipt = await activity.finish();
    await writeFile(
      path.join(projectRoot, "plugins", "modified.ts"),
      "external\n",
    );

    const secondReceipt = await activity.finish();
    const record = await activity.transactions.load("idempotent-finish-run");

    expect(secondReceipt).toEqual(firstReceipt);
    expect(record.files[0]?.after.hash).toBe(creatorContentHash("after\n"));
    await expect(
      activity.transactions.status("idempotent-finish-run"),
    ).resolves.toMatchObject({ undoable: false });
  });

  it("rejects a before-state journal that exceeds its bounded size", async () => {
    const projectRoot = await createProject();
    const oversizedPath = path.join(projectRoot, "plugins", "oversized.ts");
    await writeFile(oversizedPath, "x".repeat(MAX_CREATOR_TRANSACTION_BYTES));
    const activity = new CreatorActivityRecorder(projectRoot);
    activity.begin("oversized-run");

    await expect(
      activity.captureBefore("plugins/oversized.ts"),
    ).rejects.toMatchObject({ code: "CREATOR_TRANSACTION_TOO_LARGE" });
  });

  it("undoes create, modify, and delete together when every after hash matches", async () => {
    const projectRoot = await createProject();
    const { activity } = await createThreeWayTransaction(
      projectRoot,
      "undo-success-run",
    );

    const result = await activity.transactions.undo("undo-success-run");

    expect(result.changedPaths).toEqual([
      "plugins/created.ts",
      "plugins/deleted.ts",
      "plugins/modified.ts",
    ]);
    await expect(
      readFile(path.join(projectRoot, "plugins", "modified.ts"), "utf8"),
    ).resolves.toBe("before\n");
    await expect(
      readFile(path.join(projectRoot, "plugins", "deleted.ts"), "utf8"),
    ).resolves.toBe("delete me\n");
    await expect(
      readFile(path.join(projectRoot, "plugins", "created.ts"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("performs zero writes when any target has a conflict", async () => {
    const projectRoot = await createProject();
    const store = new CreatorTransactionStore(projectRoot);
    await writeFile(path.join(projectRoot, "plugins", "modified.ts"), "after\n");
    await writeFile(path.join(projectRoot, "plugins", "second.ts"), "after two\n");
    await store.persistRun({
      runId: "conflict-run",
      mutationRevision: 2,
      validationRevision: null,
      files: [
        {
          path: "plugins/modified.ts",
          before: "before\n",
          after: "after\n",
        },
        {
          path: "plugins/second.ts",
          before: "before two\n",
          after: "after two\n",
        },
      ],
    });
    await writeFile(path.join(projectRoot, "plugins", "second.ts"), "external\n");

    await expect(store.undo("conflict-run")).rejects.toMatchObject({
      code: "CREATOR_UNDO_CONFLICT",
    });
    await expect(
      readFile(path.join(projectRoot, "plugins", "modified.ts"), "utf8"),
    ).resolves.toBe("after\n");
    await expect(
      readFile(path.join(projectRoot, "plugins", "second.ts"), "utf8"),
    ).resolves.toBe("external\n");
  });

  it("rolls back already restored files if an undo write fails", async () => {
    const projectRoot = await createProject();
    const store = new CreatorTransactionStore(projectRoot);
    await writeFile(path.join(projectRoot, "plugins", "modified.ts"), "after\n");
    await writeFile(path.join(projectRoot, "plugins", "second.ts"), "after two\n");
    await store.persistRun({
      runId: "rollback-run",
      mutationRevision: 2,
      validationRevision: null,
      files: [
        {
          path: "plugins/modified.ts",
          before: "before\n",
          after: "after\n",
        },
        {
          path: "plugins/second.ts",
          before: "before two\n",
          after: "after two\n",
        },
      ],
    });

    await expect(
      store.undo("rollback-run", { simulateFailureAfterWrite: 1 }),
    ).rejects.toThrow("Simulated Creator undo failure");
    await expect(
      readFile(path.join(projectRoot, "plugins", "modified.ts"), "utf8"),
    ).resolves.toBe("after\n");
    await expect(
      readFile(path.join(projectRoot, "plugins", "second.ts"), "utf8"),
    ).resolves.toBe("after two\n");
  });
});
