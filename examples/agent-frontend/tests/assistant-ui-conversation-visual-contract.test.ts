import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const surfaceUrl = new URL(
  "../agent-ui/conversation/ConversationSurface.tsx",
  import.meta.url,
);
const themeHookUrl = new URL(
  "../agent-ui/theme/useAgentUITheme.ts",
  import.meta.url,
);
const presentationConfigUrl = new URL(
  "../agent-ui/conversation/config/conversation-presentation-config.ts",
  import.meta.url,
);
const globalsUrl = new URL(
  "../../../packages/react/src/styles.css",
  import.meta.url,
);
const pluginRuntimeStylesUrl = new URL(
  "../runtime/plugins/plugin-runtime.css",
  import.meta.url,
);
const surfaceDefinitionUrl = new URL(
  "../plugins/conversation-surface/definition.ts",
  import.meta.url,
);
const appUIUrl = new URL("../app-ui/app-ui.json", import.meta.url);
const threadListPluginUrl = new URL(
  "../plugins/conversation-thread-list/index.tsx",
  import.meta.url,
);
const threadListStylesUrl = new URL(
  "../plugins/conversation-thread-list/styles.css",
  import.meta.url,
);
const vendorThreadListUrl = new URL(
  "../../../packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread-list.aui.tsx",
  import.meta.url,
);
const threadUrl = new URL(
  "../../../packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx",
  import.meta.url,
);
const composableThreadUrl = new URL(
  "../../../packages/react/src/internal/composable-thread.tsx",
  import.meta.url,
);
const publicUrl = new URL("../../../packages/react/src/public.tsx", import.meta.url);

describe("assistant-ui conversation visual contract", () => {
  it("keeps theme ownership and root class mapping explicit", async () => {
    const [surface, themeHook, surfaceDefinition] = await Promise.all([
      readFile(surfaceUrl, "utf8"),
      readFile(themeHookUrl, "utf8"),
      readFile(surfaceDefinitionUrl, "utf8"),
    ]);

    expect(surface).toContain(
      'export type ConversationTheme = "light" | "dark"',
    );
    expect(surface).toContain('theme = "light"');
    expect(surface).toContain(
      'theme === "dark" ? "dark" : undefined',
    );
    expect(surface).toContain("data-theme={theme}");
    expect(themeHook).toContain("AGENT_UI_THEME_SERVICE");
    expect(themeHook).toContain("useSyncExternalStore");
    expect(themeHook).toContain('getDefaultThemeMode = (): AgentUIThemeMode => "light"');
    expect(surfaceDefinition).toContain("AGENT_UI_CONVERSATION_SERVICE");
    expect(surfaceDefinition).toContain("inject");
    expect(surfaceDefinition).toContain("AGENT_UI_THEME_SERVICE");
    expect(surfaceDefinition).toContain("optionalInject");
    expect(surface).toContain('"bg-background"');
  });

  it("keeps the upstream semantic token and layout invariants", async () => {
    const [globals, thread] = await Promise.all([
      readFile(globalsUrl, "utf8"),
      readFile(threadUrl, "utf8"),
    ]);

    for (const selector of [
      '.agent-ui-conversation[data-theme="light"]',
      '.agent-ui-conversation[data-theme="dark"]',
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
      "--color-sidebar",
      "--color-sidebar-foreground",
      "--color-sidebar-accent",
      "--color-sidebar-border",
      "--color-sidebar-ring",
      "--sidebar",
      "--sidebar-foreground",
      "--sidebar-primary",
      "--sidebar-accent",
      "--sidebar-border",
      "--sidebar-ring",
    ]) {
      expect(globals).toContain(token);
    }
    expect(globals).toContain("color-scheme: light;");
    expect(globals).toContain("color-scheme: dark;");
    expect(globals).not.toContain("  background: var(--background);");

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

  it("keeps fill child Slots and Conversation surfaces at full size", async () => {
    const [pluginRuntimeStyles, globals] = await Promise.all([
      readFile(pluginRuntimeStylesUrl, "utf8"),
      readFile(globalsUrl, "utf8"),
    ]);

    expect(pluginRuntimeStyles).toMatch(
      /\.app-ui-plugin-slot-width-probe\[data-slot-sizing="fill"\]\s*>\s*\.app-ui-plugin-slot-content\s*>\s*\.app-ui-plugin-instance\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;/u,
    );
    expect(globals).toMatch(
      /\.agent-ui-conversation\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;/u,
    );
  });

  it("keeps canonical presentation config in application source", async () => {
    const config = await readFile(presentationConfigUrl, "utf8");

    expect(config).toContain("conversationWelcomeConfig");
    expect(config).not.toContain("AppUIRuntimeModel");
    expect(config).not.toContain("pluginInstances");
    expect(config).not.toContain("resolveConversationPresentationConfig");
    for (const disabledReplacementId of [
      "agent-welcome-main",
      "agent-prompts-main",
      "agent-sender-main",
    ]) {
      expect(config).not.toContain(disabledReplacementId);
    }
  });

  it("owns assistant message vertical rhythm at the message composition layer", async () => {
    const [composableThread, publicSource] = await Promise.all([
      readFile(composableThreadUrl, "utf8"),
      readFile(publicUrl, "utf8"),
    ]);

    expect(composableThread).toMatch(
      /data-slot="aui_assistant-message-parts"[\s\S]*className="flex flex-col gap-y-4"/u,
    );
    expect(composableThread).toMatch(
      /data-slot="aui_chain-of-thought"[\s\S]*className="flex flex-col gap-y-4"/u,
    );
    expect(composableThread).toContain('<ReasoningRoot className="mb-0"');
    expect(publicSource).toContain('<InternalReasoningRoot className="mb-0"');
  });

  it(
    "keeps AppUIModel as layout owner and ThreadList as navigation presentation owner",
    async () => {
      const [
        surface,
        appUI,
        threadListPlugin,
        threadListStyles,
        vendorThreadList,
      ] = await Promise.all([
        readFile(surfaceUrl, "utf8"),
        readFile(appUIUrl, "utf8"),
        readFile(threadListPluginUrl, "utf8"),
        readFile(threadListStylesUrl, "utf8"),
        readFile(vendorThreadListUrl, "utf8"),
      ]);

      expect(surface).toContain('"bg-background"');
      expect(appUI).toContain('"id": "conversation-navigation"');
      expect(appUI).toContain('"id": "conversation-surface"');
      expect(appUI).not.toContain("assistant-ui-workspace-shell");
      expect(appUI).not.toMatch(
        /bg-sidebar|text-sidebar-foreground|padding-inline/u,
      );

      expect(threadListPlugin).toContain("conversation-thread-list-plugin");
      expect(threadListPlugin).toContain('import "./styles.css"');
      expect(threadListStyles).toContain("background: var(--sidebar);");
      expect(threadListStyles).toContain("color: var(--sidebar-foreground);");
      expect(threadListStyles).toContain("padding-inline: 0.5rem;");
      expect(vendorThreadList).not.toContain("bg-sidebar");
      expect(vendorThreadList).not.toContain("text-sidebar-foreground");
    },
  );
});
