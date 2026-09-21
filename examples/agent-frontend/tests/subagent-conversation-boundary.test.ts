import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

describe("subagent conversation plugin boundary", () => {
  it("consumes the presentation scope without importing AG-UI protocol events", async () => {
    const source = await readFile(
      path.join(projectRoot, "plugins/subagent-conversation/index.tsx"),
      "utf8",
    );

    expect(source).toContain('from "@agent-ui/react"');
    expect(source).toContain("conversation.subagent");
    expect(source).not.toMatch(/@ag-ui\/(?:core|client)/);
    expect(source).not.toMatch(/SUBAGENT_(?:STARTED|FINISHED|ERROR)/);
    expect(source).not.toMatch(/subagentRunId|parentToolCallId/);
  });
});
