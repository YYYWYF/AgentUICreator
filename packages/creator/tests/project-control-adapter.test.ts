import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  PROJECT_CONTROL_ENTRY_PATH,
  ProjectControlAdapter,
} from "../src/index.js";

const temporaryProjects: string[] = [];

async function createControlProject(source: string): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "creator-control-"));
  temporaryProjects.push(projectRoot);
  const executableDirectory = path.join(projectRoot, "node_modules", ".bin");
  await mkdir(path.join(projectRoot, "scripts"), { recursive: true });
  await mkdir(executableDirectory, { recursive: true });
  await symlink(
    process.execPath,
    path.join(
      executableDirectory,
      process.platform === "win32" ? "tsx.cmd" : "tsx",
    ),
  );
  await writeFile(path.join(projectRoot, PROJECT_CONTROL_ENTRY_PATH), source);
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

describe("ProjectControlAdapter", () => {
  it("calls only the fixed target entry with a versioned JSON request", async () => {
    const projectRoot = await createControlProject(`
let source = "";
for await (const chunk of process.stdin) source += chunk;
const request = JSON.parse(source);
process.stdout.write(JSON.stringify({ schemaVersion: 2, ok: true, result: request }));
`);
    const adapter = new ProjectControlAdapter({ projectRoot });

    const result = await adapter.request("inspect_ui_plugin", {
      pluginId: "sample",
    });

    expect(result).toEqual({
      schemaVersion: 2,
      operation: "inspect_ui_plugin",
      input: { pluginId: "sample" },
    });
  });

  it("serializes mutation child processes so each one rechecks current state", async () => {
    const projectRoot = await createControlProject(`
const { readFile, writeFile } = await import("node:fs/promises");
let source = "";
for await (const chunk of process.stdin) source += chunk;
const request = JSON.parse(source);
const statePath = new URL("../state.txt", import.meta.url);
const current = Number(await readFile(statePath, "utf8"));
await new Promise((resolve) => setTimeout(resolve, 40));
if (current !== request.input.expected) {
  process.stdout.write(JSON.stringify({
    schemaVersion: 2,
    ok: false,
    error: { code: "STALE", message: "State changed" }
  }));
  process.exitCode = 1;
} else {
  await writeFile(statePath, String(current + 1));
  process.stdout.write(JSON.stringify({
    schemaVersion: 2,
    ok: true,
    result: { changedPaths: [], revision: current + 1 }
  }));
}
`);
    await writeFile(path.join(projectRoot, "state.txt"), "0");
    const firstAdapter = new ProjectControlAdapter({ projectRoot });
    const secondAdapter = new ProjectControlAdapter({ projectRoot });

    const settled = await Promise.allSettled([
      firstAdapter.request("mutate_app_ui_model", { expected: 0 }),
      secondAdapter.request("mutate_app_ui_model", { expected: 0 }),
    ]);

    expect(settled.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(settled.find((item) => item.status === "rejected")).toMatchObject({
      status: "rejected",
      reason: { code: "STALE" },
    });
  });

  it("diagnoses a missing fixed entry without falling back to project guesses", async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), "creator-control-"));
    temporaryProjects.push(projectRoot);
    const adapter = new ProjectControlAdapter({ projectRoot });

    await expect(adapter.request("inspect_ui_project")).rejects.toMatchObject({
      code: "CONTROL_ENTRY_MISSING",
    });
  });

  it("rejects incompatible protocol versions", async () => {
    const projectRoot = await createControlProject(`
for await (const chunk of process.stdin) void chunk;
process.stdout.write(JSON.stringify({ schemaVersion: 3, ok: true, result: {} }));
`);
    const adapter = new ProjectControlAdapter({ projectRoot });

    await expect(adapter.request("inspect_ui_project")).rejects.toMatchObject({
      code: "CONTROL_PROTOCOL_INCOMPATIBLE",
    });
  });

  it("terminates a control entry that exceeds its fixed timeout", async () => {
    const projectRoot = await createControlProject(`
for await (const chunk of process.stdin) void chunk;
setTimeout(() => process.stdout.write("{}"), 1000);
`);
    const adapter = new ProjectControlAdapter({ projectRoot, timeoutMs: 20 });

    await expect(adapter.request("inspect_ui_project")).rejects.toEqual(
      expect.objectContaining({
        code: "CONTROL_ENTRY_TIMEOUT",
      }),
    );
  });
});
