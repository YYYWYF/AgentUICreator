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
  it("defines exactly the nine upstream-neutral conversation Slots", () => {
    expect(Object.values(ASSISTANT_UI_CONVERSATION_SLOTS)).toEqual([
      "conversation.empty.welcome",
      "conversation.empty.suggestions",
      "conversation.timeline",
      "conversation.composer",
      "conversation.message.reasoning",
      "conversation.message.tool-activity",
      "conversation.message.tool-item",
      "conversation.message.attachments",
      "conversation.message.sources",
    ]);
  });

  it("preserves the three-level Slot ownership hierarchy", async () => {
    const surface = JSON.parse(
      await read("plugins/conversation-surface/manifest.json"),
    ) as { slots: { children: string[] } };
    const timeline = JSON.parse(
      await read("plugins/agent-message-list/manifest.json"),
    ) as { slots: { children: string[] } };
    const toolActivity = JSON.parse(
      await read("plugins/agent-tool-activity/manifest.json"),
    ) as { slots: { children: string[] } };

    expect(surface.slots.children).toEqual([
      ASSISTANT_UI_CONVERSATION_SLOTS.welcome,
      ASSISTANT_UI_CONVERSATION_SLOTS.suggestions,
      ASSISTANT_UI_CONVERSATION_SLOTS.timeline,
      ASSISTANT_UI_CONVERSATION_SLOTS.composer,
    ]);
    expect(timeline.slots.children).toEqual([
      ASSISTANT_UI_CONVERSATION_SLOTS.reasoning,
      ASSISTANT_UI_CONVERSATION_SLOTS.toolActivity,
      ASSISTANT_UI_CONVERSATION_SLOTS.attachments,
      ASSISTANT_UI_CONVERSATION_SLOTS.sources,
    ]);
    expect(toolActivity.slots.children).toEqual([
      ASSISTANT_UI_CONVERSATION_SLOTS.toolItem,
    ]);
  });

  it("keeps assistant-ui component overrides inside the adapter", async () => {
    const adapter = await read(
      "agent-ui/adapters/assistant-ui/conversation/AssistantUiConversationAdapter.tsx",
    );
    const messageAdapters = await read(
      "agent-ui/adapters/assistant-ui/slots/AssistantUiMessageSlotAdapters.tsx",
    );
    const model = await read("app-ui/app-ui.json");

    for (const seam of [
      "WelcomeWrapper",
      "TimelineWrapper",
      "InitialSuggestionsWrapper",
      "ComposerWrapper",
      "ReasoningGroup",
      "ToolGroup",
      "ToolFallback",
      "UserAttachmentsWrapper",
      "MessageFooter",
    ]) {
      expect(adapter).toContain(seam);
    }
    expect(messageAdapters).toContain("projectAssistantUiMessages");
    expect(messageAdapters).toContain("projectAssistantUiExecutions");
    expect(messageAdapters).toContain("MessageRenderProvider");
    expect(messageAdapters).not.toMatch(
      /@ag-ui\/client|HttpAgent|runAgent|AppUIModel|SourceRegistry/u,
    );
    expect(model).not.toMatch(/ReasoningGroup|ToolGroup|ToolFallback|ThreadPrimitive/u);
  });

  it("retains structural timeline and tool-activity hosts", async () => {
    const timeline = await read("plugins/agent-message-list/index.tsx");
    const toolActivity = await read("plugins/agent-tool-activity/index.tsx");

    expect(timeline).toContain("MessageSlotBridgeProvider");
    expect(timeline).toContain("ASSISTANT_UI_CONVERSATION_SLOTS.timeline");
    expect(timeline).toContain("timeline.fallback");
    expect(toolActivity).toContain("ToolItemSlotBridgeProvider");
    expect(toolActivity).toContain("ASSISTANT_UI_CONVERSATION_SLOTS.toolActivity");
    expect(toolActivity).toContain("toolActivity.fallback");
  });

  it("maps every leaf independently and suppresses empty sources", async () => {
    const source = await read(
      "agent-ui/adapters/assistant-ui/slots/AssistantUiMessageSlotAdapters.tsx",
    );

    for (const slot of [
      "reasoning",
      "toolActivity",
      "toolItem",
      "attachments",
      "sources",
    ]) {
      expect(source).toContain(`ASSISTANT_UI_CONVERSATION_SLOTS.${slot}`);
    }
    expect(source).toContain("if (items.length === 0) return null");
    expect(source).toContain("useOptionalMessageSlotBridge");
    expect(source).toContain("useOptionalToolItemSlotBridge");
  });
});
