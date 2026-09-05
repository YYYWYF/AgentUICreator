import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CREATOR_MODEL_ENV_FILE,
  CREATOR_MODEL_NAME,
  loadCreatorModelConfig,
} from "../src/index.js";

const temporaryProjects: string[] = [];

async function createConfigProject(source: string): Promise<string> {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "agent-ui-creator-config-"),
  );
  temporaryProjects.push(projectRoot);
  await writeFile(path.join(projectRoot, CREATOR_MODEL_ENV_FILE), source);
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { force: true, recursive: true }),
    ),
  );
});

describe("loadCreatorModelConfig", () => {
  it("loads the local-only OpenAI-compatible model settings", async () => {
    const projectRoot = await createConfigProject(
      [
        "MODEL_PROVIDER=openai",
        "MODEL_BASE_URL=https://models.example.test/v1",
        "MODEL_API_KEY='test-key'",
        `MODEL_NAME="${CREATOR_MODEL_NAME}"`,
      ].join("\n"),
    );

    expect(
      loadCreatorModelConfig({ configRoot: projectRoot, environment: {} }),
    ).toEqual({
      provider: "openai",
      baseURL: "https://models.example.test/v1",
      apiKey: "test-key",
      modelName: CREATOR_MODEL_NAME,
    });
  });

  it("keeps the legacy runtime compatible with primary Creator model names", async () => {
    const projectRoot = await createConfigProject(
      [
        "CREATOR_MODEL_BASE_URL=https://models.example.test/v1",
        "CREATOR_MODEL_API_KEY=test-key",
        `CREATOR_MODEL_NAME=${CREATOR_MODEL_NAME}`,
      ].join("\n"),
    );

    expect(
      loadCreatorModelConfig({ configRoot: projectRoot, environment: {} }),
    ).toEqual({
      provider: "openai",
      baseURL: "https://models.example.test/v1",
      apiKey: "test-key",
      modelName: CREATOR_MODEL_NAME,
    });
  });

  it("rejects every model other than the configured Creator model", async () => {
    const projectRoot = await createConfigProject(
      [
        "MODEL_PROVIDER=openai",
        "MODEL_BASE_URL=https://models.example.test/v1",
        "MODEL_API_KEY=test-key",
        "MODEL_NAME=default-model",
      ].join("\n"),
    );

    expect(() =>
      loadCreatorModelConfig({
        configRoot: projectRoot,
        environment: { MODEL_NAME: "kimi-k2.7-code" },
      }),
    ).toThrow(`Creator 只允许使用 ${CREATOR_MODEL_NAME}`);
  });
});
