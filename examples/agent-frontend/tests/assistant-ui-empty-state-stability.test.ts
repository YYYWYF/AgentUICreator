import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("assistant-ui empty-state stability", () => {
  it("keeps suggestions under the empty-state Welcome seam", async () => {
    const [adapter, plugin] = await Promise.all([
      readFile(
        path.join(
          projectRoot,
          "agent-ui/conversation/ConversationAdapter.tsx",
        ),
        "utf8",
      ),
      readFile(
        path.join(projectRoot, "plugins/conversation-surface/index.tsx"),
        "utf8",
      ),
    ]);
    expect(adapter).toContain("ConversationEmptyState");
    expect(adapter).toContain("ConversationEmptyStateContext");
    expect(plugin).toContain('renderSlot("emptySuggestions", null)');
    expect(adapter).not.toContain("renderSlot");
    expect(adapter).not.toContain("emptyWelcome");
    expect(adapter).not.toContain("emptySuggestions");
    expect(adapter).not.toContain("composer.isEmpty");
  });

  it("suppresses only the upstream starter-suggestions wrapper", async () => {
    const globals = await readFile(
      path.join(projectRoot, "../../packages/react/src/styles.css"),
      "utf8",
    );
    expect(globals).toContain(".agent-ui-conversation .aui-thread-welcome-suggestions");
    expect(globals).toContain("display: none");
    expect(globals).not.toContain("aui-thread-followup-suggestions");
  });

  it("separates populated Suggestions from Composer at the adapter seam", async () => {
    const globals = await readFile(
      path.join(projectRoot, "../../packages/react/src/styles.css"),
      "utf8",
    );
    expect(globals).toContain(".conversation-empty-state-suggestions");
    expect(globals).toContain(":has(");
    expect(globals).toContain('[data-ui-plugin="conversation-suggestions"]');
    expect(globals).toContain("margin-bottom: 1rem");
  });
});
