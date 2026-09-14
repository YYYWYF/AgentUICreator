import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import appUIJson from "../app-ui/app-ui.json";
import { resolveConversationPresentationConfig } from "../agent-ui/conversation/config";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("assistant-ui default composition", () => {
  it("keeps the default model to three top-level and one child presentation plugin", () => {
    const model = parseAppUIModel(appUIJson);
    const visible = Object.values(model.pluginInstances)
      .filter((instance) => instance.enabled && instance.mount !== undefined)
      .map((instance) => instance.id);

    expect(visible).toEqual([
      "conversation-thread-list-main",
      "theme-switch-main",
      "agent-conversation-surface-main",
      "conversation-suggestions-main",
    ]);
    expect(Object.keys(model.pluginInstances)).toEqual([
      "agent-conversation-data-main",
      "agent-conversation-service-main",
      "theme-provider-main",
      "conversation-thread-list-main",
      "theme-switch-main",
      "agent-conversation-surface-main",
      "conversation-suggestions-main",
    ]);
    expect(Object.values(model.pluginInstances).filter((instance) => instance.enabled && instance.mount === undefined).map((instance) => instance.id)).toEqual([
      "agent-conversation-data-main",
      "agent-conversation-service-main",
      "theme-provider-main",
    ]);

  });

  it("uses AppUIModel layout Slots with the theme control below navigation", () => {
    const model = parseAppUIModel(appUIJson);
    expect(model.root).toMatchObject({
      type: "row",
      id: "conversation-workspace-row",
    });
    const root = model.root;
    expect(root.type).toBe("row");
    if (root.type !== "row") {
      throw new Error("Expected the default root to be a row");
    }
    const navigationPanel = root.children.find(
      (child) => child.type === "panel" && child.id === "conversation-navigation-panel",
    );
    expect(navigationPanel).toMatchObject({
      type: "panel",
      child: {
        type: "column",
        id: "conversation-navigation-column",
        sizes: ["minmax(0, 1fr)", "auto"],
        children: [
          { type: "slot", slotId: "conversation.navigation" },
          { type: "slot", slotId: "application.theme-control" },
        ],
      },
    });
    expect(JSON.stringify(model.root)).toContain("conversation.surface");
    expect(JSON.stringify(model.root)).not.toContain("workspace.inspector");
    expect(model.pluginInstances["conversation-thread-list-main"]).toMatchObject({
      mount: { slotId: "conversation.navigation" },
    });
    expect(model.pluginInstances["theme-switch-main"]).toMatchObject({
      pluginId: "theme-switch",
      enabled: true,
      mount: { slotId: "application.theme-control" },
    });
    expect(model.pluginInstances["agent-conversation-surface-main"]).toMatchObject({
      mount: { slotId: "conversation.surface" },
    });
    expect(model.pluginInstances["agent-conversation-surface-main"]?.props).toBeUndefined();
  });

  it("leaves interaction presentation unconfigured so the adapter owns the upstream fallback", () => {
    const model = parseAppUIModel(appUIJson);
    expect(resolveConversationPresentationConfig(model)).toEqual({
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
