import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  resolveCreatorAgentRuntime,
  resolveCreatorPythonAgentMode,
} from "../src/creatorRuntimeConfig.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Creator runtime selection", () => {
  it("uses Python as the default runtime", () => {
    expect(resolveCreatorAgentRuntime({ environment: {} })).toBe("python");
  });

  it("allows TypeScript only as an explicit environment fallback", () => {
    expect(
      resolveCreatorAgentRuntime({
        environment: { CREATOR_AGENT_RUNTIME: "typescript" },
      }),
    ).toBe("typescript");
  });

  it("reads the TypeScript fallback from Creator host configuration", async () => {
    const configRoot = await mkdtemp(path.join(tmpdir(), "creator-runtime-"));
    temporaryDirectories.push(configRoot);
    await writeFile(
      path.join(configRoot, ".env.creator.local"),
      "MODEL_NAME=mimo-v2.5-pro\nCREATOR_AGENT_RUNTIME=typescript\n",
    );

    expect(resolveCreatorAgentRuntime({ configRoot, environment: {} })).toBe(
      "typescript",
    );
  });

  it("gives the process environment priority over Creator host configuration", async () => {
    const configRoot = await mkdtemp(path.join(tmpdir(), "creator-runtime-"));
    temporaryDirectories.push(configRoot);
    await writeFile(
      path.join(configRoot, ".env.creator.local"),
      "CREATOR_AGENT_RUNTIME=typescript\n",
    );

    expect(
      resolveCreatorAgentRuntime({
        configRoot,
        environment: { CREATOR_AGENT_RUNTIME: "python" },
      }),
    ).toBe("python");
  });

  it("rejects unsupported runtimes without silently falling back", () => {
    expect(() =>
      resolveCreatorAgentRuntime({
        environment: { CREATOR_AGENT_RUNTIME: "other" },
      }),
    ).toThrow(/typescript, python/u);
  });
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

  it("rejects unsupported modes without silently selecting a default", () => {
    expect(() =>
      resolveCreatorPythonAgentMode({
        environment: { CREATOR_PYTHON_AGENT_MODE: "other" },
      }),
    ).toThrow(/echo, minimal, domain-read, domain-write/u);
  });
});
