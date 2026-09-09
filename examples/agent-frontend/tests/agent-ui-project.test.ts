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
      parseAgentUIProjectConfig({ version: "1", mode: "assistant" }),
    ).toEqual({ version: "1", mode: "assistant" });
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

  it("initializes independent Mode and AppUIModel files", async () => {
    const projectRoot = await temporaryProject();
    const result = await createUIProject({ projectRoot, mode: "assistant" });
    const projectConfigSource = await readFile(
      path.join(projectRoot, ".agent-ui", "project.json"),
      "utf8",
    );
    const appUIModelSource = await readFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      "utf8",
    );

    expect(JSON.parse(projectConfigSource)).toEqual({
      version: "1",
      mode: "assistant",
    });
    expect(parseAppUIModelJson(appUIModelSource)).toEqual(result.appUIModel);
    expect(JSON.parse(appUIModelSource)).not.toHaveProperty("mode");

    await writeFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      `${JSON.stringify(
        agentUIModeRegistry.get("embedded").createInitialAppUIModel(),
        null,
        2,
      )}\n`,
    );
    await expect(readAgentUIProjectConfig(projectRoot)).resolves.toEqual({
      config: { version: "1", mode: "assistant" },
      legacy: false,
      path: ".agent-ui/project.json",
    });
  });

  it("defaults project creation to platform and does not overwrite existing composition", async () => {
    const defaultRoot = await temporaryProject();
    await expect(createUIProject({ projectRoot: defaultRoot })).resolves.toEqual(
      expect.objectContaining({ mode: "platform" }),
    );

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
      createUIProject({ projectRoot: existingRoot, mode: "embedded" }),
    ).rejects.toThrow("Refusing to overwrite");
    await expect(
      readFile(path.join(existingRoot, "app-ui", "app-ui.json"), "utf8"),
    ).resolves.toBe(existingSource);
    await expect(
      readFile(path.join(existingRoot, ".agent-ui", "project.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
