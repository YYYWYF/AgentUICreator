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
    expect(adapter).toContain("SemanticReasoningOutlet");
    expect(adapter).toContain("SemanticToolActivityOutlet");
    expect(adapter).toContain("SemanticToolItemOutlet");
    expect(adapter).not.toMatch(
      /conversation\.empty\.suggestions|conversation\.timeline|conversation\.composer|conversation\.message\.attachments|conversation\.message\.sources/u,
    );
  });

  it("leaves suggestions to assistant-ui runtime configuration", async () => {
    const app = await read("src/App.tsx");
    const thread = await read(
      "agent-ui/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx",
    );
    expect(app).toContain("Suggestions(");
    expect(app).toContain("presentationConfig.starterSuggestions");
    expect(thread).toContain("ThreadPrimitive.Suggestions");
    expect(thread).not.toContain("InitialSuggestionsWrapper");
  });

  it("does not inject message attachments or sources through a Thread footer", async () => {
    const thread = await read(
      "agent-ui/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx",
    );
    const messageAdapters = await read(
      "agent-ui/adapters/assistant-ui/slots/AssistantUiMessageSlotAdapters.tsx",
    );
    expect(thread).toContain("<UserMessageAttachments />");
    expect(thread).not.toContain("MessageFooter");
    expect(thread).not.toContain("UserAttachmentsWrapper");
    expect(messageAdapters).not.toContain("SemanticAttachmentsOutlet");
    expect(messageAdapters).not.toContain("SemanticSourcesOutlet");
  });
});
