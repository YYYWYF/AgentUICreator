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
      "conversation.message.reasoning",
      "conversation.message.tool-activity",
      "conversation.message.tool-item",
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
    expect(adapter).toContain("ReasoningGroup: SemanticReasoningOutlet");
    expect(adapter).toContain("ToolGroup: SemanticToolActivityOutlet");
    expect(adapter).toContain("ToolFallback: SemanticToolItemOutlet");
    expect(adapter).not.toMatch(
      /ThreadPresentation|ToolCallWrapper|ComposerAddon|WelcomeWrapper|TimelineWrapper|InitialSuggestionsWrapper/u,
    );
    expect(surface).not.toContain("presentation=");
    expect(toolkit).toContain("useAuiState");
    expect(toolkit).toContain("projectSubagentToolCalls");
    expect(toolkit).toContain("<ToolFallback {...props} />");
  });

  it("keeps the old plugin-only slots outside the native assistant-ui contract", async () => {
    const legacy = await read(
      "agent-ui/adapters/assistant-ui/slots/semantic-slots.ts",
    );
    expect(legacy).toContain("LEGACY_ASSISTANT_UI_CONVERSATION_SLOTS");
    expect(legacy).toContain("conversation.message.attachments");
    expect(legacy).toContain("conversation.message.sources");
  });
});
