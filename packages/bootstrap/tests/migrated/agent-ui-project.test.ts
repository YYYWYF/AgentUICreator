import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  parseAgentUIProjectConfig,
} from "../../../project-control/src/framework/contracts/agent-ui-project";
import { parseAppUIModelJson } from "../../../project-control/src/framework/contracts/app-ui-model";
import { agentUIModeRegistry } from "../../../project-control/src/framework/modes/index";
import { agentUIPresetRegistry } from "../../../project-control/src/framework/presets/index";
import { createUIProject } from "../../../project-control/src/project/project-initializer";
import { readAgentUIProjectConfig } from "../../../project-control/src/project/project-mode";

const temporaryProjects: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

async function temporaryProject(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "agent-ui-mode-"));
  temporaryProjects.push(projectRoot);
  return projectRoot;
}

describe("Agent UI project Mode persistence", () => {
  it("parses a strict project config and rejects invalid Modes", () => {
    expect(
      parseAgentUIProjectConfig({ mode: "platform", sourceRoot: "agent-ui" }),
    ).toEqual({ mode: "platform", sourceRoot: "agent-ui" });
    expect(() =>
      parseAgentUIProjectConfig({ mode: "floating", sourceRoot: "agent-ui" }),
    ).toThrow();
    expect(() =>
      parseAgentUIProjectConfig({
        mode: "platform", sourceRoot: "agent-ui",
        surface: "desktop",
      }),
    ).toThrow();
  });

  it("rejects a project without configuration", async () => {
    const projectRoot = await temporaryProject();
    await expect(readAgentUIProjectConfig(projectRoot)).rejects.toThrow("Invalid Agent UI project configuration.");
  });

  it("persists each explicitly supplied Mode and independent AppUIModel", async () => {
    for (const mode of ["assistant", "embedded", "platform"] as const) {
      const projectRoot = await temporaryProject();
      const appUIModel = agentUIPresetRegistry
        .getDefaultForMode(mode, agentUIModeRegistry)
        .createAppUIModel();
      const result = await createUIProject({ projectRoot, mode, sourceRoot: "src/agent-ui", appUIModel });
      const projectConfigSource = await readFile(
        path.join(projectRoot, ".agent-ui", "project.json"),
        "utf8",
      );
      const appUIModelSource = await readFile(
        path.join(projectRoot, "src", "agent-ui", "app-ui", "app-ui.json"),
        "utf8",
      );

      expect(JSON.parse(projectConfigSource)).toEqual({ mode, sourceRoot: "src/agent-ui" });
      expect(parseAppUIModelJson(appUIModelSource)).toEqual(appUIModel);
      expect(JSON.parse(appUIModelSource)).not.toHaveProperty("mode");
      expect(result.appUIModel).toEqual(appUIModel);

      await expect(readAgentUIProjectConfig(projectRoot)).resolves.toEqual({
        config: { mode, sourceRoot: "src/agent-ui" },
        path: ".agent-ui/project.json",
      });
    }
  });

  it("does not overwrite an existing composition", async () => {
    const existingRoot = await temporaryProject();
    await mkdir(path.join(existingRoot, "src", "agent-ui", "app-ui"), { recursive: true });
    const existingSource = '{"userLayout":true}\n';
    await writeFile(
      path.join(existingRoot, "src", "agent-ui", "app-ui", "app-ui.json"),
      existingSource,
    );
    await expect(readAgentUIProjectConfig(existingRoot)).rejects.toThrow();
    await expect(
      readFile(path.join(existingRoot, "src", "agent-ui", "app-ui", "app-ui.json"), "utf8"),
    ).resolves.toBe(existingSource);

    await expect(
      createUIProject({
        projectRoot: existingRoot,
        mode: "platform",
        sourceRoot: "src/agent-ui",
        appUIModel: agentUIPresetRegistry
          .getDefaultForMode("platform", agentUIModeRegistry)
          .createAppUIModel(),
      }),
    ).rejects.toThrow("Refusing to overwrite");
    await expect(
      readFile(path.join(existingRoot, "src", "agent-ui", "app-ui", "app-ui.json"), "utf8"),
    ).resolves.toBe(existingSource);
    await expect(
      readFile(path.join(existingRoot, ".agent-ui", "project.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses to overwrite an existing project config before writing composition", async () => {
    const existingRoot = await temporaryProject();
    await mkdir(path.join(existingRoot, ".agent-ui"), { recursive: true });
    const existingSource = '{"mode":"platform","sourceRoot":"src/agent-ui"}\n';
    await writeFile(
      path.join(existingRoot, ".agent-ui", "project.json"),
      existingSource,
    );

    await expect(
      createUIProject({
        projectRoot: existingRoot,
        mode: "assistant",
        sourceRoot: "src/agent-ui",
        appUIModel: agentUIPresetRegistry
          .getDefaultForMode("assistant", agentUIModeRegistry)
          .createAppUIModel(),
      }),
    ).rejects.toThrow("Refusing to overwrite");
    await expect(
      readFile(path.join(existingRoot, ".agent-ui", "project.json"), "utf8"),
    ).resolves.toBe(existingSource);
    await expect(
      readFile(path.join(existingRoot, "src", "agent-ui", "app-ui", "app-ui.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
