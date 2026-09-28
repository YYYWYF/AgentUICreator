import { generatedProjectFixture, repositoryRoot } from "../../../project-control/tests/support/generated-project";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = await generatedProjectFixture();

describe("assistant-ui agent elements contract map", () => {
  it("records all official capabilities with a fail-closed binding state", async () => {
    const source = await readFile(
      path.join(repositoryRoot, "docs/assistant-ui-agent-elements-contract-map.md"),
      "utf8",
    );

    for (const capability of ["AgentPlan", "AgentStatus", "SubagentList"]) {
      expect(source).toContain(`| ${capability} |`);
    }
    const rows = source
      .split("\n")
      .filter((line) => /^\| (?:AgentPlan|AgentStatus|SubagentList) \|/.test(line));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.split("|").at(-3)?.trim().replaceAll("`", "")).toMatch(/^(?:active|dormant)$/u);
    }
  });
});
