import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("assistant-ui interaction state contract", () => {
  it("leaves reasoning and tool presentation with upstream assistant-ui", async () => {
    const adapter = await readFile(
      path.join(projectRoot, "agent-ui/conversation/ConversationAdapter.tsx"),
      "utf8",
    );
    const thread = await readFile(
      path.join(projectRoot, "../../packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx"),
      "utf8",
    );

    expect(adapter).toContain("Welcome:");
    expect(adapter).toContain("ScopedReasoningGroup");
    expect(adapter).toContain("ScopedToolGroup");
    expect(adapter).toContain("ScopedToolFallback");
    expect(adapter).toContain("AssistantMessageFooter: ScopedAssistantMessageFooter");
    expect(adapter).not.toContain("AssistantMessage: ScopedAssistantMessage");
    expect(thread).toContain("MessagePrimitive.Parts");
    expect(thread).toContain("Reasoning");
    expect(thread).toContain("ToolGroup");
  });

  it("does not expose legacy message Slot bridge ownership", async () => {
    const adapter = await readFile(
      path.join(projectRoot, "agent-ui/conversation/ConversationAdapter.tsx"),
      "utf8",
    );
    const plugin = await readFile(
      path.join(projectRoot, "plugins/conversation-surface/index.tsx"),
      "utf8",
    );
    expect(plugin).toContain('renderSlot("emptyWelcome"');
    expect(plugin).toContain('renderSlot("emptySuggestions"');
    expect(plugin).toContain('renderSlot("headerActions"');
    expect(plugin).not.toContain("liveStatus");
    expect(adapter).not.toContain("renderSlot");
    expect(adapter).not.toContain("emptyWelcome");
    expect(adapter).not.toContain("emptySuggestions");
  });
});
