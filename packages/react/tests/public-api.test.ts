import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("@agent-ui/react public API", () => {
  it("exposes the root facade, optional lexical entry, theme contract and styles", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };
    const indexSource = await readFile(path.join(packageRoot, "src/index.ts"), "utf8");

    expect(indexSource.trim()).toBe('export * from "./public.js";');
    expect(Object.keys(packageJson.exports ?? {}).sort()).toEqual([".", "./lexical", "./styles.css", "./theme"]);
    expect(Object.keys(packageJson.exports ?? {}).some((key) => key.includes("*") || key.includes("internal"))).toBe(false);
  });

  it("keeps the required generic Conversation and UI facade", async () => {
    const source = await readFile(path.join(packageRoot, "src/public.tsx"), "utf8");

    for (const publicName of [
      "AgentPlan",
      "ConversationAgentPlanProps",
      "ConversationAgentPlanStep",
      "ConversationThread",
      "ConversationSuggestions",
      "ConversationSuggestionTrigger",
      "ConversationSuggestionTitle",
      "ConversationSuggestionDescription",
      "ConversationToolCall",
      "ConversationSource",
      "ConversationSourcePart",
      "ConversationTaskGroup",
      "ConversationTaskGroupRenderScope",
      "JobProgress",
      "ConversationJobOutcome",
      "ConversationJobProgressOutcome",
      "JobProgressStage",
      "ConversationAgentStatus",
      "ConversationTaskTray",
      "ConversationCanonicalMessageError",
      "ConversationAssistantResponseFooterRenderScope",
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
    for (const name of [
      "ConversationResponseActionBarRoot", "ConversationResponseBranchPicker",
      "ConversationCanonicalResponseCopyAction", "ConversationCanonicalResponseReloadAction",
      "ConversationCanonicalResponseExportMarkdownAction", "useConversationResponseRuntime",
    ]) expect(source).toMatch(new RegExp(`export const ${name}\\b`, "u"));
    for (const forbiddenName of [
      "SourceMessagePart",
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
