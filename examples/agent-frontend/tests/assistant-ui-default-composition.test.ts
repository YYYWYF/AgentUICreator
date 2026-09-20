import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import appUIJson from "../app-ui/app-ui.json";
import { conversationPresentationConfig } from "../agent-ui/conversation/config";
import { collectAppUIPluginLocations, parseAppUIModel } from "../framework/contracts/app-ui-model";
import { pluginCapabilityCatalog } from "../plugins";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("assistant-ui default composition", () => {
  it("exposes renderer mode, accepted capability, and mounted Plugin in authoring facts", () => {
    const manifest = pluginCapabilityCatalog.list().find(({ manifest }) => manifest.id === "conversation-surface")?.manifest;
    const slots = manifest?.slots?.children;
    expect(slots?.reasoningGroup).toMatchObject({ mode: "renderer", cardinality: "one", accepts: {
      anyOfCapabilities: ["conversation-reasoning-renderer"],
    } });
    expect(slots?.toolGroup?.mode).toBe("renderer");
    expect(slots?.toolFallback?.mode).toBe("renderer");
    const locations = collectAppUIPluginLocations(parseAppUIModel(appUIJson));
    expect(locations.find(({ plugin }) => plugin.id === "assistant-ui-reasoning-main")?.target)
      .toMatchObject({ type: "plugin_slot", parentInstanceId: "agent-conversation-surface-main", slot: "reasoningGroup" });
  });
  it("projects canonical authoring placement for default renderer assets", () => {
    expect(pluginCapabilityCatalog.list().find(({ manifest }) => manifest.id === "assistant-ui-reasoning")?.manifest.authoring).toEqual({
      intents: [
        "show the reasoning process",
        "restore reasoning presentation",
        "show deep thinking",
      ],
      visualRole: "assistant reasoning presentation",
      defaultPlacement: {
        type: "plugin_slot",
        parentPluginId: "conversation-surface",
        slot: "reasoningGroup",
      },
    });
    expect(pluginCapabilityCatalog.list().find(({ manifest }) => manifest.id === "assistant-ui-tool-group")?.manifest.authoring?.defaultPlacement).toEqual({
      type: "plugin_slot",
      parentPluginId: "conversation-surface",
      slot: "toolGroup",
    });
    expect(pluginCapabilityCatalog.list().find(({ manifest }) => manifest.id === "assistant-ui-tool-fallback")?.manifest.authoring?.defaultPlacement).toEqual({
      type: "plugin_slot",
      parentPluginId: "conversation-surface",
      slot: "toolFallback",
    });
  });
  it("keeps the default model to application plugins and semantic child Slot plugins", () => {
    const model = parseAppUIModel(appUIJson);
    const locations = collectAppUIPluginLocations(model);
    const visible = locations
      .filter(({ plugin, target }) => plugin.enabled && target.type !== "application")
      .map(({ plugin }) => plugin.id);

    expect(visible).toEqual([
      "conversation-thread-list-main",
      "agent-conversation-surface-main",
      "conversation-suggestions-main",
      "assistant-ui-reasoning-main",
      "assistant-ui-tool-group-main",
      "assistant-ui-tool-fallback-main",
    ]);
    expect(locations.map(({ plugin }) => plugin.id)).toEqual([
      "agent-conversation-data-main",
      "agent-conversation-service-main",
      "theme-provider-main",
      "locale-provider-main",
      "conversation-thread-list-main",
      "agent-conversation-surface-main",
      "conversation-suggestions-main",
      "assistant-ui-reasoning-main",
      "assistant-ui-tool-group-main",
      "assistant-ui-tool-fallback-main",
    ]);
    expect(locations.filter(({ plugin, target }) => plugin.enabled && target.type === "application").map(({ plugin }) => plugin.id)).toEqual([
      "agent-conversation-data-main",
      "agent-conversation-service-main",
      "theme-provider-main",
      "locale-provider-main",
    ]);

  });

  it("keeps canonical app-ui data composition-only", () => {
    const source = JSON.stringify(appUIJson);
    expect(source).not.toContain('"props"');
    expect(source).not.toContain('"settings"');
  });

  it("keeps the conversation and thread-list composition in separate panels", () => {
    const model = parseAppUIModel(appUIJson);
    expect(model.root).toMatchObject({
      type: "row",
    });
    const root = model.root;
    expect(root.type).toBe("row");
    if (root.type !== "row") {
      throw new Error("Expected the default root to be a row");
    }
    const conversationPanel = root.children[1];
    expect(conversationPanel).toMatchObject({
      type: "panel",
      child: { type: "slot" },
    });
    expect(JSON.stringify(model.root)).toContain("conversation-surface");
    expect(JSON.stringify(model.root)).not.toContain("workspace.inspector");
    const locations = collectAppUIPluginLocations(model);
    expect(locations.some(({ plugin }) => plugin.id === "conversation-thread-list-main"))
      .toBe(true);
    expect(locations.some(({ plugin }) => plugin.id === "theme-switch-main")).toBe(false);
    expect(locations.find(({ plugin }) => plugin.id === "agent-conversation-surface-main")?.target)
      .toMatchObject({ type: "layout_slot", slotPath: "root.children[1].child" });
  });

  it("keeps Welcome presentation in application configuration", () => {
    expect(conversationPresentationConfig).toEqual({
      welcome: { title: "How can I help you today?" },
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
    expect(conversationAdapter).toContain("ScopedReasoningGroup");
    expect(conversationAdapter).toContain("ScopedToolGroup");
    expect(conversationAdapter).toContain("ScopedToolFallback");
    expect(conversationAdapter).toContain("Welcome:");
    expect(conversationAdapter).not.toContain("ToolCallWrapper");
    expect(thread).toContain("ActionBarMorePrimitive");
    expect(thread).toContain("ExportMarkdown");
    expect(thread).toContain("Export as Markdown");
  });
});
