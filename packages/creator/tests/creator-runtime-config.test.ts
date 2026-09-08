import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveCreatorPythonAgentMode } from "../src/creatorRuntimeConfig.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Python Creator agent mode selection", () => {
  it("uses domain-write by default", () => {
    expect(resolveCreatorPythonAgentMode({ environment: {} })).toBe(
      "domain-write",
    );
  });

  it.each(["echo", "minimal", "domain-read", "domain-write"] as const)(
    "accepts the explicit %s diagnostic mode",
    (mode) => {
      expect(
        resolveCreatorPythonAgentMode({
          environment: { CREATOR_PYTHON_AGENT_MODE: mode },
        }),
      ).toBe(mode);
    },
  );

  it("reads the mode from Creator host configuration", async () => {
    const configRoot = await mkdtemp(path.join(tmpdir(), "creator-runtime-"));
    temporaryDirectories.push(configRoot);
    await writeFile(
      path.join(configRoot, ".env.creator.local"),
      "CREATOR_PYTHON_AGENT_MODE=domain-read\n",
    );

    expect(resolveCreatorPythonAgentMode({ configRoot, environment: {} })).toBe(
      "domain-read",
    );
  });

  it("rejects unsupported modes without silently selecting a default", () => {
    expect(() =>
      resolveCreatorPythonAgentMode({
        environment: { CREATOR_PYTHON_AGENT_MODE: "other" },
      }),
    ).toThrow(/echo, minimal, domain-read, domain-write/u);
  });
});
