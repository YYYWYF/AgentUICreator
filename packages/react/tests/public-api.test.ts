import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("@agent-ui/react public API", () => {
  it("exposes only the package root facade and styles", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };
    const indexSource = await readFile(path.join(packageRoot, "src/index.ts"), "utf8");

    expect(indexSource.trim()).toBe('export * from "./public.js";');
    expect(Object.keys(packageJson.exports ?? {}).sort()).toEqual([".", "./styles.css"]);
    expect(Object.keys(packageJson.exports ?? {}).some((key) => key.includes("*") || key.includes("internal"))).toBe(false);
  });

  it("keeps the required generic Conversation and UI facade", async () => {
    const source = await readFile(path.join(packageRoot, "src/public.tsx"), "utf8");

    for (const publicName of [
      "ConversationThread",
      "ConversationSuggestions",
      "ConversationSuggestionTrigger",
      "ConversationSuggestionTitle",
      "ConversationSuggestionDescription",
      "ConversationToolCall",
      "ConversationSubagentMessages",
      "ConversationSubagentTool",
      "ConversationSubagentRenderScope",
      "ConversationCanonicalAssistantMessage",
      "ConversationActionBarRoot",
      "ConversationActionCopy",
      "ConversationActionReload",
      "ConversationActionExportMarkdown",
      "ConversationCanonicalCopyAction",
      "ConversationCanonicalReloadAction",
      "ConversationCanonicalExportMarkdownAction",
      "ConversationBranchPicker",
      "ConversationTooltipIconButton",
      "ConversationThreadListRoot",
      "ConversationCanonicalComposer",
      "ConversationComposerAddAttachment",
      "ConversationComposerDictate",
      "ConversationComposerStopDictation",
      "ConversationComposerSend",
      "ConversationComposerCancel",
      "useConversationState",
      "Button",
    ]) {
      expect(source, publicName).toMatch(new RegExp(`export (?:function|interface|type) ${publicName}\\b`, "u"));
    }
    for (const forbiddenName of [
      "ThreadPrimitive",
      "useAui",
      "AuiConfig",
      "Tools",
      "AssistantUi",
    ]) {
      expect(source).not.toMatch(new RegExp(`export (?:const|function|interface|type|\\{[^}]*\\b)${forbiddenName}\\b`, "u"));
    }
  });
});
