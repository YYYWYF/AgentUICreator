import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

describe("assistant-ui semantic Slot rendering", () => {
  it("routes only public ThreadComponent seams through the adapter", async () => {
    const adapter = await read(
      "agent-ui/adapters/assistant-ui/conversation/AssistantUiConversationAdapter.tsx",
    );
    expect(adapter).toContain("ASSISTANT_UI_CONVERSATION_SLOTS.welcome");
    expect(adapter).toContain("renderSlot(ASSISTANT_UI_CONVERSATION_SLOTS.welcome");
    expect(adapter).toContain("ASSISTANT_UI_CONVERSATION_SLOTS.suggestions");
    expect(adapter).toContain("renderSlot(ASSISTANT_UI_CONVERSATION_SLOTS.suggestions");
    expect(adapter).not.toContain("SemanticReasoningOutlet");
    expect(adapter).not.toContain("SemanticToolActivityOutlet");
    expect(adapter).not.toContain("SemanticToolItemOutlet");
    expect(adapter).not.toMatch(
      /conversation\.timeline|conversation\.composer|conversation\.message\.attachments|conversation\.message\.sources/u,
    );
  });

  it("routes starter suggestions through the canonical child Slot", async () => {
    const app = await read("src/App.tsx");
    const thread = await read(
      "agent-ui/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx",
    );
    const globals = await read("agent-ui/adapters/assistant-ui/styles/globals.css");
    expect(app).not.toContain("Suggestions(");
    expect(app).not.toContain("starterSuggestions");
    expect(thread).toContain("ThreadPrimitive.Suggestions");
    expect(thread).not.toContain("InitialSuggestionsWrapper");
    expect(globals).toContain(".aui-thread-welcome-suggestions");
    expect(globals).toContain("display: none");
  });

  it("keeps message auxiliary presentation in the upstream Thread", async () => {
    const thread = await read(
      "agent-ui/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx",
    );
    expect(thread).toContain("<UserMessageAttachments />");
    expect(thread).not.toContain("MessageFooter");
    expect(thread).not.toContain("UserAttachmentsWrapper");
  });
});
