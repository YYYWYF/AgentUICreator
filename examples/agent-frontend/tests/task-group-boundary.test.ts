import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

describe("task group Plugin boundary", () => {
  it("consumes the semantic task-group scope through the public facade", async () => {
    const source = await readFile(
      path.join(projectRoot, "plugins/task-group/index.tsx"),
      "utf8",
    );

    expect(source).toContain('from "@agent-ui/react"');
    expect(source).toContain("conversation.task-group");
    expect(source).not.toMatch(/@ag-ui\/(?:core|client)/u);
    expect(source).not.toMatch(/SUBAGENT_(?:STARTED|FINISHED|ERROR)/u);
    expect(source).not.toMatch(/parentToolCallId|subagentRunId/u);
  });
});
