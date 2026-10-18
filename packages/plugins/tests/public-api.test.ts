import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import deliveries from "../src/catalog/plugin-delivery.json";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("@za38.03/agent-ui-plugins public API", () => {
  it("exposes components, Composer, optional extensions, theme contract and styles", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };
    const indexSource = await readFile(path.join(packageRoot, "src/index.ts"), "utf8");

    expect(indexSource.trim()).toBe('export * from "./public.js";');
    expect(Object.keys(packageJson.exports ?? {}).sort()).toEqual([".", "./demo-attachments", "./generative-ui", "./generative-ui.css", "./lexical", "./styles.css", "./theme", "./catalog", "./catalog.json", "./compatibility.json", "./composer-support", "./plugin-support", "./form-tools", "./source-registry/registry.json", "./sources/*", ...deliveries.map(plugin => `./${plugin.id}`)].sort());
    expect(Object.keys(packageJson.exports ?? {}).some((key) => (key.includes("*") && key !== "./sources/*") || key.includes("internal"))).toBe(false);
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
      expect(source, publicName).toMatch(new RegExp(`export\\s+(?:const|function|interface|type) ${publicName}\\b|export\\s*\\{[^}]*\\b${publicName}\\b`, "u"));
    }
    for (const name of [
      "ConversationResponseActionBarRoot", "ConversationResponseBranchPicker",
      "ConversationCanonicalResponseCopyAction", "ConversationCanonicalResponseReloadAction",
      "ConversationCanonicalResponseExportMarkdownAction", "useConversationResponseRuntime",
    ]) expect(source).toMatch(new RegExp(`export\\s+(?:const|function) ${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`, "u"));
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
