import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("conversation navigation policy", () => {
  it("keeps navigation on the assistant-ui ThreadList surface", async () => {
    const threadList = await readFile(
      path.join(projectRoot, "plugins/conversation-thread-list/index.tsx"),
      "utf8",
    );
    const appUI = await readFile(path.join(projectRoot, "app-ui/app-ui.json"), "utf8");

    expect(threadList).toContain("ThreadList");
    expect(appUI).toContain("conversation.navigation");
    expect(appUI).toContain("conversation.surface");
  });

  it("does not reintroduce a second conversation runtime", async () => {
    const service = await readFile(
      path.join(projectRoot, "plugins/conversation-service/index.ts"),
      "utf8",
    );
    expect(service).not.toMatch(/new\s+AgentRuntime|create.*Runtime/u);
  });
});
