import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveCreatorAgentRuntime } from "../src/creatorRuntimeConfig.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Creator runtime selection", () => {
  it("keeps TypeScript as the migration default", () => {
    expect(resolveCreatorAgentRuntime({ environment: {} })).toBe("typescript");
  });

  it("reads the Python feature flag from Creator host configuration", async () => {
    const configRoot = await mkdtemp(path.join(tmpdir(), "creator-runtime-"));
    temporaryDirectories.push(configRoot);
    await writeFile(
      path.join(configRoot, ".env.creator.local"),
      "MODEL_NAME=mimo-v2.5-pro\nCREATOR_AGENT_RUNTIME=python\n",
    );

    expect(resolveCreatorAgentRuntime({ configRoot, environment: {} })).toBe(
      "python",
    );
  });

  it("rejects unsupported runtimes without silently falling back", () => {
    expect(() =>
      resolveCreatorAgentRuntime({
        environment: { CREATOR_AGENT_RUNTIME: "other" },
      }),
    ).toThrow(/typescript, python/u);
  });
});
