import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import appUIJson from "../app-ui/app-ui.json";
import { resolveAssistantUiPresentationConfig } from "../agent-ui/adapters/assistant-ui/config";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("assistant-ui default composition", () => {
  it("keeps the default model to two visible presentation plugins and two headless services", () => {
    const model = parseAppUIModel(appUIJson);
    const visible = Object.values(model.pluginInstances)
      .filter((instance) => instance.enabled && instance.mount !== undefined)
      .map((instance) => instance.id);

    expect(visible).toEqual([
      "agent-conversation-surface-main",
      "assistant-ui-thread-list-main",
    ]);
    expect(Object.keys(model.pluginInstances)).toEqual([
      "agent-conversation-data-main",
      "agent-conversation-surface-main",
      "agent-conversation-controller-main",
      "assistant-ui-thread-list-main",
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

  it("uses the two-column Layout Tree without an inspector or theme slot", () => {
    const model = parseAppUIModel(appUIJson);
    expect(model.root).toMatchObject({
      type: "row",
      id: "agent-workspace",
      gap: 0,
      sizes: ["16rem", "minmax(0, 1fr)"],
      children: [
        {
          type: "column",
          id: "agent-sidebar",
          gap: 0,
          sizes: ["minmax(0, 1fr)"],
          children: [{ type: "slot", slotId: "agent-conversations" }],
        },
        {
          type: "column",
          id: "agent-conversation",
          gap: 0,
          sizes: ["minmax(0, 1fr)"],
          children: [{ type: "slot", slotId: "workspace.conversation" }],
        },
      ],
    });
    expect(JSON.stringify(model.root)).not.toContain("workspace.inspector");
    expect(JSON.stringify(model.root)).not.toContain("agent-theme-switch");
  });

  it("leaves presentation configuration empty so upstream defaults own the surface", () => {
    const model = parseAppUIModel(appUIJson);
    expect(model.pluginInstances["agent-conversation-surface-main"]?.props).toBeUndefined();
    expect(resolveAssistantUiPresentationConfig(model)).toEqual({
      welcome: {},
      starterSuggestions: [],
      composer: { quickPrompts: [] },
      interactions: { toolGroupVariant: "ghost" },
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

  it("retains upstream ThreadList and conversation data Slot surfaces", async () => {
    const threadList = await readFile(path.join(projectRoot, "agent-ui/vendor/assistant-ui/components/assistant-ui/elements/thread-list.aui.tsx"), "utf8");
    const thread = await readFile(path.join(projectRoot, "agent-ui/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx"), "utf8");

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
  });
});
