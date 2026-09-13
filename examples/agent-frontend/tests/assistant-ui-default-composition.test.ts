import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import appUIJson from "../app-ui/app-ui.json";
import { resolveAssistantUiPresentationConfig } from "../agent-ui/adapters/assistant-ui/config";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("assistant-ui default composition", () => {
  it("keeps the default model to three visible presentation plugins and two headless services", () => {
    const model = parseAppUIModel(appUIJson);
    const visible = Object.values(model.pluginInstances)
      .filter((instance) => instance.enabled && instance.mount !== undefined)
      .map((instance) => instance.id);

    expect(visible).toEqual([
      "agent-conversation-surface-main",
      "assistant-ui-thread-list-main",
      "assistant-ui-workspace-shell-main",
    ]);
    expect(Object.keys(model.pluginInstances)).toEqual([
      "agent-conversation-data-main",
      "agent-conversation-surface-main",
      "agent-conversation-controller-main",
      "assistant-ui-thread-list-main",
      "assistant-ui-workspace-shell-main",
    ]);
    expect(Object.values(model.pluginInstances).filter((instance) => instance.enabled && instance.mount === undefined).map((instance) => instance.id)).toEqual([
      "agent-conversation-data-main",
      "agent-conversation-controller-main",
    ]);

    for (const forbiddenPluginId of [
      "mock-auth-login",
      "antd-x-theme-provider",
      "antd-x-theme-switch",
      "workspace-inspector",
      "agent-tool-detail",
      "antd-x-resources",
      "agent-message-sources",
      "agent-thread-welcome",
      "agent-message-list",
      "agent-reasoning",
      "agent-message-attachments",
      "agent-tool-activity",
      "agent-tool",
      "agent-suggestions",
      "agent-composer",
    ]) {
      expect(Object.values(model.pluginInstances).some((instance) => instance.pluginId === forbiddenPluginId), forbiddenPluginId).toBe(false);
    }
  });

  it("uses the Workspace Shell outlet without an inspector or theme slot", () => {
    const model = parseAppUIModel(appUIJson);
    expect(model.root).toMatchObject({
      type: "slot",
      id: "assistant-ui-workspace-shell-slot-node",
      slotId: "workspace.shell",
    });
    expect(JSON.stringify(model.root)).not.toContain("workspace.inspector");
    expect(JSON.stringify(model.root)).not.toContain("agent-theme-switch");
    expect(model.pluginInstances["assistant-ui-workspace-shell-main"]).toMatchObject({
      pluginId: "assistant-ui-workspace-shell",
      enabled: true,
      mount: { slotId: "workspace.shell" },
    });
    expect(model.pluginInstances["assistant-ui-thread-list-main"]).toMatchObject({
      mount: { slotId: "agent-conversations" },
    });
    expect(model.pluginInstances["agent-conversation-surface-main"]).toMatchObject({
      mount: { slotId: "workspace.conversation" },
      props: {
        assistantUiPresentation: {
          interactions: { reasoningVariant: "ghost", toolGroupVariant: "ghost" },
        },
      },
    });
  });

  it("uses explicit Agent Demo interaction presentation while preserving upstream fallback", () => {
    const model = parseAppUIModel(appUIJson);
    expect(resolveAssistantUiPresentationConfig(model)).toEqual({
      welcome: {},
      starterSuggestions: [],
      composer: { quickPrompts: [] },
      interactions: { reasoningVariant: "ghost", toolGroupVariant: "ghost" },
    });
  });

  it("keeps the shell and host App free of legacy branding and Ant shell ownership", async () => {
    const app = await readFile(path.join(projectRoot, "src/App.tsx"), "utf8");
    const shell = await readFile(path.join(projectRoot, "src/preview-shell.css"), "utf8");
    const threadList = await readFile(path.join(projectRoot, "plugins/assistant-ui-thread-list/index.tsx"), "utf8");

    expect(app).not.toMatch(/XProvider|antdTheme|agentFrontendThemes|sharedThemeTokens/u);
    expect(app).toContain("<UIPluginRuntime");
    expect(shell).not.toMatch(/radial-gradient|ui-grid-color|ui-shell-shadow|purple|teal/u);
    expect(threadList).toContain("useAgentUIThemeMode");
    expect(threadList).not.toContain('data-theme="dark"');
    expect(threadList).not.toContain('className="assistant-ui-thread-list-plugin agent-ui-assistant-ui dark"');
  });

  it("keeps official tool presentation in the assistant-ui config seam", async () => {
    const app = await readFile(path.join(projectRoot, "src/App.tsx"), "utf8");
    const toolkit = await readFile(
      path.join(projectRoot, "agent-ui/adapters/assistant-ui/toolkit/assistant-ui-toolkit.tsx"),
      "utf8",
    );

    expect(app).toContain("Tools({ toolkit })");
    expect(app).toContain("createAssistantUiToolkit");
    expect(toolkit).toContain('type: "backend"');
    expect(toolkit).toContain('display: "standalone"');
    expect(toolkit).not.toContain("appFrontendTools");
  });

  it("retains upstream ThreadList and conversation data Slot surfaces", async () => {
    const threadList = await readFile(path.join(projectRoot, "agent-ui/vendor/assistant-ui/components/assistant-ui/elements/thread-list.aui.tsx"), "utf8");
    const thread = await readFile(path.join(projectRoot, "agent-ui/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx"), "utf8");
    const conversationAdapter = await readFile(path.join(projectRoot, "agent-ui/adapters/assistant-ui/conversation/AssistantUiConversationAdapter.tsx"), "utf8");

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
    expect(conversationAdapter).toContain("ToolCallWrapper");
    expect(thread).toContain("ActionBarMorePrimitive");
    expect(thread).toContain("ExportMarkdown");
    expect(thread).toContain("Export as Markdown");
  });
});
