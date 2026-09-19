import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { conversationStarterSuggestions } from "../agent-ui/conversation/config";
import { conversationSuggestionsPlugin } from "../plugins/conversation-suggestions/definition";
import { ConversationSuggestionsPlugin } from "../plugins/conversation-suggestions";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Conversation Suggestions boundary", () => {
  it("keeps starter content in application/runtime configuration", () => {
    expect(conversationStarterSuggestions).toHaveLength(3);
    expect(conversationStarterSuggestions[0]).toEqual({
      title: "分析 Agent UI 架构",
      label: "检查布局、Plugin 与 Service 边界",
      prompt: "帮我分析当前 Agent UI 架构",
    });
  });

  it("renders the assistant-ui runtime suggestion scope through the public facade", async () => {
    const [source, runtimeProvider, reactFacade] = await Promise.all([
      readFile(
        path.join(projectRoot, "plugins/conversation-suggestions/index.tsx"),
        "utf8",
      ),
      readFile(
        path.join(projectRoot, "../../packages/runtime-conversation/src/ConversationRuntimeProvider.tsx"),
        "utf8",
      ),
      readFile(
        path.join(projectRoot, "../../packages/react/src/public.tsx"),
        "utf8",
      ),
    ]);
    expect(conversationSuggestionsPlugin.manifest).toMatchObject({
      id: "conversation-suggestions",
      version: "1.0.0",
      capabilities: ["conversation-suggestions"],
    });
    expect(source).toContain('from "@agent-ui/react"');
    expect(source).toContain("ConversationSuggestions");
    expect(source).toContain("send");
    expect(source).not.toContain("usePluginInstance");
    expect(source).not.toContain("instance.props");
    expect(source).not.toContain("readSuggestionItems");
    expect(source).toContain('data-ui-plugin="conversation-suggestions"');
    expect(runtimeProvider).toContain("AuiConfig");
    expect(runtimeProvider).toContain("Suggestions(");
    expect(reactFacade).toContain("ThreadPrimitive.Suggestions");
    expect(reactFacade).toContain("SuggestionPrimitive.Trigger");
    expect(reactFacade).toContain("SuggestionPrimitive.Title");
    expect(reactFacade).toContain("SuggestionPrimitive.Description");
    expect(reactFacade).not.toContain("ConversationSuggestionState");
    expect(ConversationSuggestionsPlugin).toBeTypeOf("function");
  });
});
