import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const surfaceUrl = new URL(
  "../agent-ui/adapters/assistant-ui/conversation/AssistantUiConversationSurface.tsx",
  import.meta.url,
);
const themeHookUrl = new URL(
  "../agent-ui/theme/useAgentUITheme.ts",
  import.meta.url,
);
const presentationResolverUrl = new URL(
  "../agent-ui/adapters/assistant-ui/config/assistant-ui-presentation-config.ts",
  import.meta.url,
);
const globalsUrl = new URL(
  "../agent-ui/adapters/assistant-ui/styles/globals.css",
  import.meta.url,
);
const threadUrl = new URL(
  "../agent-ui/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx",
  import.meta.url,
);

describe("assistant-ui conversation visual contract", () => {
  it("keeps theme ownership and root class mapping explicit", async () => {
    const [surface, themeHook] = await Promise.all([
      readFile(surfaceUrl, "utf8"),
      readFile(themeHookUrl, "utf8"),
    ]);

    expect(surface).toContain(
      'export type AssistantUiConversationTheme = "light" | "dark"',
    );
    expect(surface).toContain('theme = "light"');
    expect(surface).toContain(
      'theme === "dark" ? "dark" : undefined',
    );
    expect(surface).toContain("data-theme={theme}");
    expect(themeHook).toContain("AGENT_UI_THEME_SERVICE");
    expect(themeHook).toContain("useSyncExternalStore");
    expect(themeHook).toContain('getDefaultThemeMode = (): AgentUIThemeMode => "light"');
  });

  it("keeps the upstream semantic token and layout invariants", async () => {
    const [globals, thread] = await Promise.all([
      readFile(globalsUrl, "utf8"),
      readFile(threadUrl, "utf8"),
    ]);

    for (const selector of [
      '.agent-ui-assistant-ui[data-theme="light"]',
      '.agent-ui-assistant-ui[data-theme="dark"]',
    ]) {
      expect(globals).toContain(selector);
    }
    for (const token of [
      "--background",
      "--foreground",
      "--card",
      "--popover",
      "--primary",
      "--secondary",
      "--muted",
      "--accent",
      "--border",
      "--input",
      "--ring",
      "--radius",
      "--radius-2xl",
      "--radius-3xl",
    ]) {
      expect(globals).toContain(token);
    }
    expect(globals).toContain("color-scheme: light;");
    expect(globals).toContain("color-scheme: dark;");

    expect(thread).toContain('["--thread-max-width" as string]: "44rem"');
    expect(thread).toContain('["--composer-radius" as string]: "1.5rem"');
    expect(thread).toContain('["--composer-padding" as string]: "8px"');
    for (const className of [
      "aui-thread-root",
      "aui-thread-viewport-footer",
      "aui-composer-root",
      "aui-composer-input",
    ]) {
      expect(thread).toContain(className);
    }
    for (const dataSlot of [
      'data-slot="aui_assistant-message-root"',
      'data-slot="aui_user-message-root"',
    ]) {
      expect(thread).toContain(dataSlot);
    }
  });

  it("separates canonical presentation config from replacement instances", async () => {
    const resolver = await readFile(presentationResolverUrl, "utf8");

    expect(resolver).toContain('"agent-conversation-surface-main"');
    expect(resolver).toContain("assistantUiPresentation");
    for (const disabledReplacementId of [
      "agent-welcome-main",
      "agent-prompts-main",
      "agent-sender-main",
    ]) {
      expect(resolver).not.toContain(disabledReplacementId);
    }
  });
});
