import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "../..");

describe("assistant message ownership", () => {
  it("keeps Data Message rendering generic", async () => {
    const source = await readFile(
      path.join(packageRoot, "src/internal/composable-thread.tsx"),
      "utf8",
    );
    expect(source).toMatch(/case "data":\s*return part\.dataRendererUI;/u);
    expect(source).not.toContain('"chart"');
  });

  it("keeps grouping policy and the Footer seam in ComposableThread", async () => {
    const publicSource = await readFile(
      path.join(packageRoot, "src/public.tsx"),
      "utf8",
    );
    const composableThread = await readFile(
      path.join(packageRoot, "src/internal/composable-thread.tsx"),
      "utf8",
    );

    expect(composableThread).toContain("taskAwareGroupBy");
    expect(composableThread).toContain("AssistantMessageFooter");
    for (const forbidden of [
      "MessagePrimitive.GroupedParts",
      "groupPartByType",
      "TASK_GROUP_PATH",
      "taskAwareGroupBy",
      "isTaskPart",
    ]) {
      expect(publicSource, forbidden).not.toContain(forbidden);
    }
  });

  it("does not route nested subagent data from the product conversation bridge", async () => {
    for (const relativePath of [
      "examples/agent-frontend/agent-ui/conversation/ConversationAdapter.tsx",
      "examples/agent-frontend/agent-ui/conversation/ScopedRendererBridge.tsx",
    ]) {
      const source = await readFile(path.join(repoRoot, relativePath), "utf8");
      expect(source).not.toContain("part.messages");
      expect(source).not.toContain("Array.isArray(tool.messages)");
      expect(source).not.toMatch(/SUBAGENT_(?:STARTED|FINISHED|ERROR)/u);
    }
  });
});
