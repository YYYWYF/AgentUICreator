import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import appUIJson from "../app-ui/app-ui.json";
import { resolveConversationPresentationConfig } from "../agent-ui/conversation/config";
import { collectAppUIPluginLocations, parseAppUIModel } from "../framework/contracts/app-ui-model";
import { compileAppUIModel } from "../framework/contracts/app-ui-compiler";
import { pluginDefinitions } from "../plugins";
import { createPluginCompositionCatalog, createPluginRegistry } from "../runtime/plugins";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("assistant-ui default composition", () => {
  it("keeps the default model to three top-level and one child presentation plugin", () => {
    const model = parseAppUIModel(appUIJson);
    const locations = collectAppUIPluginLocations(model);
    const visible = locations
      .filter(({ plugin, target }) => plugin.enabled && target.type !== "application")
      .map(({ plugin }) => plugin.id);

    expect(visible).toEqual([
      "conversation-thread-list-main",
      "theme-switch-main",
      "agent-conversation-surface-main",
      "conversation-suggestions-main",
    ]);
    expect(locations.map(({ plugin }) => plugin.id)).toEqual([
      "agent-conversation-data-main",
      "agent-conversation-service-main",
      "theme-provider-main",
      "conversation-thread-list-main",
      "theme-switch-main",
      "agent-conversation-surface-main",
      "conversation-suggestions-main",
    ]);
    expect(locations.filter(({ plugin, target }) => plugin.enabled && target.type === "application").map(({ plugin }) => plugin.id)).toEqual([
      "agent-conversation-data-main",
      "agent-conversation-service-main",
      "theme-provider-main",
    ]);

  });

  it("uses AppUIModel layout Slots with the theme control below navigation", () => {
    const model = parseAppUIModel(appUIJson);
    expect(model.root).toMatchObject({
      type: "row",
    });
    const root = model.root;
    expect(root.type).toBe("row");
    if (root.type !== "row") {
      throw new Error("Expected the default root to be a row");
    }
    const navigationPanel = root.children[0];
    expect(navigationPanel).toMatchObject({
      type: "panel",
      child: {
        type: "column",
        sizes: ["minmax(0, 1fr)", "auto"],
        children: [
          { type: "slot" },
          { type: "slot" },
        ],
      },
    });
    expect(JSON.stringify(model.root)).toContain("conversation-surface");
    expect(JSON.stringify(model.root)).not.toContain("workspace.inspector");
    const locations = collectAppUIPluginLocations(model);
    expect(locations.find(({ plugin }) => plugin.id === "conversation-thread-list-main")?.target)
      .toMatchObject({ type: "layout_slot", slotPath: "root.children[0].child.children[0]" });
    expect(locations.find(({ plugin }) => plugin.id === "theme-switch-main")?.target)
      .toMatchObject({ type: "layout_slot", slotPath: "root.children[0].child.children[1]" });
    expect(locations.find(({ plugin }) => plugin.id === "agent-conversation-surface-main")?.target)
      .toMatchObject({ type: "layout_slot", slotPath: "root.children[1].child" });
  });

  it("leaves interaction presentation unconfigured so the adapter owns the upstream fallback", () => {
    const model = parseAppUIModel(appUIJson);
    const registry = createPluginRegistry(pluginDefinitions);
    const runtimeModel = compileAppUIModel(model, createPluginCompositionCatalog(registry));
    expect(resolveConversationPresentationConfig(runtimeModel)).toEqual({
      welcome: {},
    });
  });

  it("keeps the shell and host App free of legacy branding and Ant shell ownership", async () => {
    const app = await readFile(path.join(projectRoot, "src/App.tsx"), "utf8");
    const shell = await readFile(path.join(projectRoot, "src/preview-shell.css"), "utf8");
    const threadList = await readFile(path.join(projectRoot, "plugins/conversation-thread-list/index.tsx"), "utf8");

    expect(app).not.toMatch(/XProvider|antdTheme|agentFrontendThemes|sharedThemeTokens/u);
    expect(app).toContain("<UIPluginRuntime");
    expect(shell).not.toMatch(/radial-gradient|ui-grid-color|ui-shell-shadow|purple|teal/u);
    expect(threadList).toContain("useAgentUIThemeMode");
    expect(threadList).not.toContain('data-theme="dark"');
    expect(threadList).not.toContain('className="conversation-thread-list-plugin agent-ui-conversation dark"');
  });

  it("keeps official tool presentation in the assistant-ui config seam", async () => {
    const app = await readFile(path.join(projectRoot, "src/App.tsx"), "utf8");
    const toolkit = await readFile(
      path.join(projectRoot, "agent-ui/conversation/toolkit/conversation-toolkit.tsx"),
      "utf8",
    );

    expect(app).toContain("toolkit={toolkit}");
    expect(app).toContain("<ConversationRuntimeProvider");
    expect(app).toContain("createConversationToolkit");
    expect(toolkit).toContain('type: "backend"');
    expect(toolkit).toContain('display: "standalone"');
    expect(toolkit).not.toContain("appFrontendTools");
  });

  it("retains upstream ThreadList and conversation data Slot surfaces", async () => {
    const threadList = await readFile(path.join(projectRoot, "../../packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread-list.aui.tsx"), "utf8");
    const thread = await readFile(path.join(projectRoot, "../../packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx"), "utf8");
    const conversationAdapter = await readFile(path.join(projectRoot, "agent-ui/conversation/ConversationAdapter.tsx"), "utf8");

    for (const slot of [
      "aui_thread-list-root",
      "aui_thread-list-items",
      "aui_thread-list-search",
      "aui_thread-list-new",
    ]) {
      expect(threadList).toContain(`data-slot=\"${slot}\"`);
    }
    for (const slot of [
      "aui_message-group",
      "aui_thread-viewport",
      "aui_composer-shell",
    ]) {
      expect(thread).toContain(`data-slot=\"${slot}\"`);
    }
    expect(conversationAdapter).not.toContain("AssistantMessage:");
    expect(conversationAdapter).not.toContain("ReasoningGroup");
    expect(conversationAdapter).not.toContain("ToolGroup");
    expect(conversationAdapter).not.toContain("ToolFallback");
    expect(conversationAdapter).toContain("Welcome:");
    expect(conversationAdapter).not.toContain("ToolCallWrapper");
    expect(thread).toContain("ActionBarMorePrimitive");
    expect(thread).toContain("ExportMarkdown");
    expect(thread).toContain("Export as Markdown");
  });
});
