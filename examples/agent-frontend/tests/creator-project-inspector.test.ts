import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { inspectCreatorProject, inspectCreatorProjectStructure } from "../scripts/ui-project/creator-project-inspector";
import { createV2ProjectFixture } from "./v2-project-fixture";

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
  await writeFile(target, JSON.stringify({
    root: { type: "slot", plugins: [{ id: "foo-main", pluginId: "foo", enabled: true }] },
  }));
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
    await mkdir(path.join(root, "plugins/foo"), { recursive: true });
    await writeFile(path.join(root, "plugins/foo/manifest.json"), JSON.stringify({
      id: "foo", name: "Foo", description: "Fixture", version: "1.0.0",
    }));
    await writeFile(path.join(root, "plugins/foo/definition.ts"), "export default {};\n");
    await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: { module: "ESNext", moduleResolution: "Bundler", target: "ES2022" },
      include: ["plugins/**/*.ts"],
    }));
    expect(await inspectCreatorProject(root)).toMatchObject({
      status: "legacy", projectConfig: { version: "1", mode: "platform" },
    });
  });

  it("recognizes a V2 model under sourceRoot as ready", async () => {
    const { projectRoot, paths } = await createV2ProjectFixture();
    projects.push(projectRoot);
    expect(await inspectCreatorProject(projectRoot)).toMatchObject({
      status: "ready", projectConfig: { version: "2", sourceRoot: "src/agent-ui" },
      paths: { appUIModelPath: paths.appUIModelPath },
    });
  });

  it("keeps structural inspection separate from static readiness", async () => {
    const root = await project();
    await model(root, "src/agent-ui/app-ui/app-ui.json");
    await config(root, { version: "2", mode: "assistant", sourceRoot: "src/agent-ui" });
    expect(await inspectCreatorProjectStructure(root)).toMatchObject({ status: "ready" });
    expect(await inspectCreatorProject(root)).toMatchObject({ status: "broken" });
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
