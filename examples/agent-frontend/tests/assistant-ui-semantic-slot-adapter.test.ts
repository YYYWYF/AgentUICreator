import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

describe("assistant-ui semantic Slot adapter", () => {
  it("uses official ThreadComponent seams and keeps toolkit composition external", async () => {
    const adapter = await read(
      "agent-ui/conversation/ConversationAdapter.tsx",
    );
    const surface = await read(
      "agent-ui/conversation/ConversationSurface.tsx",
    );
    const plugin = await read(
      "plugins/conversation-surface/index.tsx",
    );
    expect(adapter).toContain("Welcome:");
    expect(adapter).toContain("ReactNode");
    expect(adapter).not.toContain("renderSlot");
    expect(plugin).toContain('renderSlot("emptyWelcome"');
    expect(plugin).toContain('renderSlot("emptySuggestions"');
    expect(plugin).toContain('renderSlot("headerActions"');
    expect(plugin).not.toContain("liveStatus");
    expect(adapter).toContain("ScopedReasoningGroup");
    expect(adapter).toContain("ScopedToolGroup");
    expect(adapter).toContain("ScopedToolFallback");
    expect(adapter).not.toMatch(
      /ThreadPresentation|ToolCallWrapper|ComposerAddon|WelcomeWrapper|TimelineWrapper|InitialSuggestionsWrapper/u,
    );
    expect(surface).not.toContain("presentation=");
  });

  it("keeps Plugin child Slot names out of the reusable Agent UI layer", async () => {
    const adapter = await read(
      "agent-ui/conversation/ConversationAdapter.tsx",
    );
    expect(adapter).not.toContain("emptyWelcome");
    expect(adapter).not.toContain("emptySuggestions");
    expect(adapter).not.toContain("UIPluginComponentProps[\"renderSlot\"]");
  });
});
