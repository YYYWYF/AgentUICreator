import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ASSISTANT_UI_CONVERSATION_SLOTS } from "../agent-ui/adapters/assistant-ui/slots/semantic-slots";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

describe("assistant-ui semantic Slot adapter", () => {
  it("exposes only official Thread composition slots", () => {
    expect(Object.values(ASSISTANT_UI_CONVERSATION_SLOTS)).toEqual([
      "conversation.empty.welcome",
      "conversation.empty.suggestions",
    ]);
  });

  it("uses official ThreadComponent seams and keeps toolkit composition external", async () => {
    const adapter = await read(
      "agent-ui/adapters/assistant-ui/conversation/AssistantUiConversationAdapter.tsx",
    );
    const surface = await read(
      "agent-ui/adapters/assistant-ui/conversation/AssistantUiConversationSurface.tsx",
    );
    const toolkit = await read(
      "agent-ui/adapters/assistant-ui/toolkit/mock/MockDispatchSubagentToolUI.tsx",
    );

    expect(adapter).toContain("Welcome:");
    expect(adapter).not.toContain("ReasoningGroup");
    expect(adapter).not.toContain("ToolGroup");
    expect(adapter).not.toContain("ToolFallback");
    expect(adapter).not.toMatch(
      /ThreadPresentation|ToolCallWrapper|ComposerAddon|WelcomeWrapper|TimelineWrapper|InitialSuggestionsWrapper/u,
    );
    expect(surface).not.toContain("presentation=");
    expect(toolkit).toContain("useAuiState");
    expect(toolkit).toContain("projectSubagentToolCalls");
    expect(toolkit).toContain("<ToolFallback {...props} />");
  });

  it("keeps only the two product-owned empty-state slots", async () => {
    const slots = await read(
      "agent-ui/adapters/assistant-ui/slots/semantic-slots.ts",
    );
    expect(slots).toContain('welcome: "conversation.empty.welcome"');
    expect(slots).toContain('suggestions: "conversation.empty.suggestions"');
    expect(slots).not.toContain("conversation.message");
    expect(slots).not.toContain("conversation.timeline");
  });
});
