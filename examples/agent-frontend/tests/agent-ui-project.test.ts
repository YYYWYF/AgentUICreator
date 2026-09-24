import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  parseAgentUIProjectConfig,
  resolveAgentUIProjectConfig,
} from "../framework/contracts/agent-ui-project";
import { parseAppUIModelJson } from "../framework/contracts/app-ui-model";
import { agentUIModeRegistry } from "../framework/modes";
import { agentUIPresetRegistry } from "../framework/presets";
import { createUIProject } from "../scripts/ui-project/project-initializer";
import { readAgentUIProjectConfig } from "../scripts/ui-project/project-mode";

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
      parseAgentUIProjectConfig({ version: "1", mode: "platform" }),
    ).toEqual({ version: "1", mode: "platform" });
    expect(() =>
      parseAgentUIProjectConfig({ version: "1", mode: "floating" }),
    ).toThrow();
    expect(() =>
      parseAgentUIProjectConfig({
        version: "1",
        mode: "platform",
        surface: "desktop",
      }),
    ).toThrow();
  });

  it("resolves a project without Mode metadata as legacy platform", async () => {
    expect(resolveAgentUIProjectConfig(undefined)).toEqual({
      config: { version: "1", mode: "platform" },
      legacy: true,
    });

    const projectRoot = await temporaryProject();
    await expect(readAgentUIProjectConfig(projectRoot)).resolves.toEqual({
      config: { version: "1", mode: "platform" },
      legacy: true,
      path: ".agent-ui/project.json",
    });
  });

  it("persists each explicitly supplied Mode and independent AppUIModel", async () => {
    for (const mode of ["assistant", "embedded", "platform"] as const) {
      const projectRoot = await temporaryProject();
      const appUIModel = agentUIPresetRegistry
        .getDefaultForMode(mode, agentUIModeRegistry)
        .createAppUIModel();
      const result = await createUIProject({ projectRoot, mode, appUIModel });
      const projectConfigSource = await readFile(
        path.join(projectRoot, ".agent-ui", "project.json"),
        "utf8",
      );
      const appUIModelSource = await readFile(
        path.join(projectRoot, "app-ui", "app-ui.json"),
        "utf8",
      );

      expect(JSON.parse(projectConfigSource)).toEqual({ version: "1", mode });
      expect(parseAppUIModelJson(appUIModelSource)).toEqual(appUIModel);
      expect(JSON.parse(appUIModelSource)).not.toHaveProperty("mode");
      expect(result.appUIModel).toEqual(appUIModel);

      await expect(readAgentUIProjectConfig(projectRoot)).resolves.toEqual({
        config: { version: "1", mode },
        legacy: false,
        path: ".agent-ui/project.json",
      });
    }
  });

  it("does not overwrite an existing composition", async () => {
    const existingRoot = await temporaryProject();
    await mkdir(path.join(existingRoot, "app-ui"), { recursive: true });
    const existingSource = '{"userLayout":true}\n';
    await writeFile(
      path.join(existingRoot, "app-ui", "app-ui.json"),
      existingSource,
    );
    await readAgentUIProjectConfig(existingRoot);
    await expect(
      readFile(path.join(existingRoot, "app-ui", "app-ui.json"), "utf8"),
    ).resolves.toBe(existingSource);

    await expect(
      createUIProject({
        projectRoot: existingRoot,
        mode: "platform",
        appUIModel: agentUIPresetRegistry
          .getDefaultForMode("platform", agentUIModeRegistry)
          .createAppUIModel(),
      }),
    ).rejects.toThrow("Refusing to overwrite");
    await expect(
      readFile(path.join(existingRoot, "app-ui", "app-ui.json"), "utf8"),
    ).resolves.toBe(existingSource);
    await expect(
      readFile(path.join(existingRoot, ".agent-ui", "project.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses to overwrite an existing project config before writing composition", async () => {
    const existingRoot = await temporaryProject();
    await mkdir(path.join(existingRoot, ".agent-ui"), { recursive: true });
    const existingSource = '{"version":"1","mode":"platform"}\n';
    await writeFile(
      path.join(existingRoot, ".agent-ui", "project.json"),
      existingSource,
    );

    await expect(
      createUIProject({
        projectRoot: existingRoot,
        mode: "assistant",
        appUIModel: agentUIPresetRegistry
          .getDefaultForMode("assistant", agentUIModeRegistry)
          .createAppUIModel(),
      }),
    ).rejects.toThrow("Refusing to overwrite");
    await expect(
      readFile(path.join(existingRoot, ".agent-ui", "project.json"), "utf8"),
    ).resolves.toBe(existingSource);
    await expect(
      readFile(path.join(existingRoot, "app-ui", "app-ui.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
