import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CreatorActivityRecorder,
  ProjectCreatorBackend,
} from "../src/index.js";

const temporaryProjects: string[] = [];

async function createProject(): Promise<string> {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "creator-file-observation-"),
  );
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "plugins"));
  await writeFile(path.join(projectRoot, "plugins", "sample.ts"), "alpha\n");
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

describe("ProjectCreatorBackend file observations", () => {
  it("rejects edits and overwrites of existing files that were not read in the run", async () => {
    const projectRoot = await createProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const backend = new ProjectCreatorBackend({ projectRoot, activity });
    activity.begin("unread-run");

    const edit = await backend.edit(
      "/plugins/sample.ts",
      "alpha",
      "beta",
    );
    const write = await backend.write(
      "/plugins/sample.ts",
      "replacement\n",
    );

    expect(edit.error).toContain("read-before-edit");
    expect(write.error).toContain("read-before-write");
    await expect(
      readFile(path.join(projectRoot, "plugins", "sample.ts"), "utf8"),
    ).resolves.toBe("alpha\n");
    expect(activity.revision).toBe(0);
  });

  it("rejects a stale edit after another writer changes the observed file", async () => {
    const projectRoot = await createProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const backend = new ProjectCreatorBackend({ projectRoot, activity });
    activity.begin("stale-edit-run");

    expect((await backend.read("/plugins/sample.ts")).error).toBeUndefined();
    await writeFile(path.join(projectRoot, "plugins", "sample.ts"), "external\n");
    const result = await backend.edit(
      "/plugins/sample.ts",
      "alpha",
      "creator",
    );

    expect(result.error).toContain("stale-version");
    await expect(
      readFile(path.join(projectRoot, "plugins", "sample.ts"), "utf8"),
    ).resolves.toBe("external\n");
    expect(activity.revision).toBe(0);
  });

  it("never overwrites a path created after Creator observed it as missing", async () => {
    const projectRoot = await createProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const backend = new ProjectCreatorBackend({ projectRoot, activity });
    const filePath = path.join(projectRoot, "plugins", "new.ts");
    activity.begin("guarded-create-run");

    expect((await backend.read("/plugins/new.ts")).error).toContain(
      "ENOENT",
    );
    await writeFile(filePath, "external\n");
    const result = await backend.write(
      "/plugins/new.ts",
      "creator\n",
    );

    expect(result.error).toContain("stale-version");
    await expect(readFile(filePath, "utf8")).resolves.toBe("external\n");
    expect(activity.revision).toBe(0);
  });

  it("allows an unoccupied new path and refreshes observations after each edit", async () => {
    const projectRoot = await createProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const backend = new ProjectCreatorBackend({ projectRoot, activity });
    activity.begin("successful-run");

    const created = await backend.write(
      "/plugins/created.ts",
      "created\n",
    );
    await backend.read("/plugins/sample.ts");
    const first = await backend.edit(
      "/plugins/sample.ts",
      "alpha",
      "middle",
    );
    const second = await backend.edit(
      "/plugins/sample.ts",
      "middle",
      "final",
    );
    const receipt = await activity.finish();

    expect(created.error).toBeUndefined();
    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    expect(activity.revision).toBe(3);
    expect(receipt.files).toEqual([
      expect.objectContaining({
        path: "plugins/created.ts",
        status: "created",
      }),
      expect.objectContaining({
        path: "plugins/sample.ts",
        status: "modified",
        diff: expect.stringContaining("+final"),
      }),
    ]);
    expect(receipt.transaction).toEqual({
      runId: "successful-run",
      undoable: true,
    });
  });

  it("treats readRaw as a positive full-file observation", async () => {
    const projectRoot = await createProject();
    const activity = new CreatorActivityRecorder(projectRoot);
    const backend = new ProjectCreatorBackend({ projectRoot, activity });
    activity.begin("raw-read-run");

    const raw = await backend.readRaw("/plugins/sample.ts");
    const edit = await backend.edit(
      "/plugins/sample.ts",
      "alpha",
      "raw-observed",
    );

    expect(raw.error).toBeUndefined();
    expect(edit.error).toBeUndefined();
    await expect(
      readFile(path.join(projectRoot, "plugins", "sample.ts"), "utf8"),
    ).resolves.toBe("raw-observed\n");
  });
});
