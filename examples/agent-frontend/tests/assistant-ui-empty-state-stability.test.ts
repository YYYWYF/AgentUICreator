import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("assistant-ui empty-state stability", () => {
  it("keeps suggestions under the empty-state Welcome seam", async () => {
    const adapter = await readFile(
      path.join(
        projectRoot,
        "agent-ui/adapters/assistant-ui/conversation/AssistantUiConversationAdapter.tsx",
      ),
      "utf8",
    );
    expect(adapter).toContain("AssistantUiEmptyState");
    expect(adapter).toContain("components.Welcome =");
    expect(adapter).toContain("ASSISTANT_UI_CONVERSATION_SLOTS.suggestions");
    expect(adapter).toContain("renderSlot(ASSISTANT_UI_CONVERSATION_SLOTS.suggestions, null)");
    expect(adapter).not.toContain("composer.isEmpty");
  });

  it("suppresses only the upstream starter-suggestions wrapper", async () => {
    const globals = await readFile(
      path.join(projectRoot, "agent-ui/adapters/assistant-ui/styles/globals.css"),
      "utf8",
    );
    expect(globals).toContain(".agent-ui-assistant-ui .aui-thread-welcome-suggestions");
    expect(globals).toContain("display: none");
    expect(globals).not.toContain("aui-thread-followup-suggestions");
  });
});
