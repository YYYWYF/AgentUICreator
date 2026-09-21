import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("JobProgress Plugin protocol boundary", () => {
  it("keeps AG-UI protocol ownership out of the Plugin and projection", async () => {
    const sources = await Promise.all([
      readFile(path.join(projectRoot, "plugins/job-progress/index.tsx"), "utf8"),
      readFile(path.join(projectRoot, "agent-ui/conversation/state/job-progress-projection.ts"), "utf8"),
    ]);
    for (const source of sources) {
      expect(source).not.toMatch(/STATE_SNAPSHOT|STATE_DELTA|EventType|JsonPatch|applyPatch/u);
    }
  });

  it("uses only the public facade and runtime state hooks", async () => {
    const source = await readFile(
      path.join(projectRoot, "plugins/job-progress/index.tsx"),
      "utf8",
    );
    expect(source).toContain('from "@agent-ui/react"');
    expect(source).toContain("useAgentState");
    expect(source).toContain("useAgentRuntimeActions");
    expect(source).not.toMatch(/@assistant-ui\/react|@assistant-ui\/react-ag-ui|@ag-ui\/(?:core|client)|internal\/vendor/u);
  });
});
