import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { inspectCreatorProject } from "../scripts/ui-project/creator-project-inspector";

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projects: string[] = [];

afterEach(async () => {
  await Promise.all(projects.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "creator-inspector-"));
  projects.push(root);
  return root;
}

async function model(root: string, relativePath: string): Promise<void> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, await readFile(path.join(fixtureRoot, "app-ui/app-ui.json")));
}

async function config(root: string, value: unknown): Promise<void> {
  await mkdir(path.join(root, ".agent-ui"), { recursive: true });
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify(value));
}

describe("Creator Project Inspector", () => {
  it("recognizes a plain project as uninitialized", async () => {
    expect(await inspectCreatorProject(await project())).toEqual({ status: "uninitialized" });
  });

  it("recognizes a valid old AppUIModel as legacy platform", async () => {
    const root = await project();
    await model(root, "app-ui/app-ui.json");
    expect(await inspectCreatorProject(root)).toMatchObject({
      status: "legacy", projectConfig: { version: "1", mode: "platform" },
    });
  });

  it("recognizes a V2 model under sourceRoot as ready", async () => {
    const root = await project();
    await model(root, "src/agent-ui/app-ui/app-ui.json");
    await config(root, { version: "2", mode: "assistant", sourceRoot: "src/agent-ui" });
    expect(await inspectCreatorProject(root)).toMatchObject({
      status: "ready", projectConfig: { version: "2", sourceRoot: "src/agent-ui" },
      paths: { appUIModelPath: path.join(root, "src/agent-ui/app-ui/app-ui.json") },
    });
  });

  it("marks a configured project with a missing model as broken", async () => {
    const root = await project();
    await config(root, { version: "1", mode: "platform" });
    expect(await inspectCreatorProject(root)).toMatchObject({
      status: "broken", issues: [{ code: "AGENT_UI_APP_UI_MODEL_MISSING" }],
    });
  });

  it("marks invalid AppUIModel and unsupported config as broken", async () => {
    const root = await project();
    await model(root, "app-ui/app-ui.json");
    await writeFile(path.join(root, "app-ui/app-ui.json"), "{");
    expect(await inspectCreatorProject(root)).toMatchObject({ status: "broken" });
    await config(root, { version: "3", mode: "platform" });
    expect(await inspectCreatorProject(root)).toMatchObject({
      status: "broken", issues: [{ code: "AGENT_UI_PROJECT_CONFIG_INVALID" }],
    });
  });
});
