/**
 * Application-owned authoring metadata for the Creator Host.
 *
 * These declarations describe ownership only. They intentionally do not store
 * the application's current copy, default mode, or any other runtime value.
 */
export interface CreatorApplicationAuthoringTarget {
  id: string;
  kind: "application_config";
  name: string;
  description: string;
  intents: readonly string[];
  ownerPath: string;
  relatedPluginIds?: readonly string[];
  optional?: boolean;
  /** Owner under sourceRoot for the npm application template. */
  projectOwnerPath?: string;
}

export const creatorApplicationAuthoringTargets = [
  {
    id: "appearance.assistant-shell",
    kind: "application_config",
    name: "Floating assistant launcher and panel",
    description: "Project-owned floating button, icon and panel open/close interaction. Edit the local shell without source takeover. Keep panel children mounted while hidden to preserve conversation and Plugin services; shell layout does not belong in AppUIModel.",
    intents: ["customize floating button", "change assistant launcher icon", "change panel interaction", "修改悬浮球", "修改悬浮按钮图标", "修改面板展开收起"],
    ownerPath: "application/shell/AssistantShell.tsx",
    projectOwnerPath: "application/shell/AssistantShell.tsx",
    optional: true,
  },
  {
    id: "appearance.shell-styles",
    kind: "application_config",
    name: "Agent UI shell appearance",
    description: "Project-owned outer shell styles: launcher position, panel size, border, responsive appearance and transitions. Preserve viewport constraints and hidden panel behavior. Inner layout and Plugin composition remain in AppUIModel.",
    intents: ["change floating button position", "customize outer panel styles", "修改悬浮球位置", "修改外壳样式", "调整外框尺寸"],
    ownerPath: "application/shell/assistant-shell.css",
    projectOwnerPath: "application/shell/assistant-shell.css",
    optional: true,
  },
  {
    id: "appearance.embedded-shell-styles",
    kind: "application_config",
    name: "Embedded shell appearance",
    description: "Project-owned embedded outer shell stylesheet. Edit container appearance here; inner layout remains in AppUIModel.",
    intents: ["customize embedded shell", "修改嵌入式外壳样式"],
    ownerPath: "application/shell/embedded-shell.css",
    projectOwnerPath: "application/shell/embedded-shell.css",
    optional: true,
  },
  {
    id: "appearance.platform-shell-styles",
    kind: "application_config",
    name: "Platform shell appearance",
    description: "Project-owned platform outer shell stylesheet. Edit container appearance here; inner layout remains in AppUIModel.",
    intents: ["customize platform shell", "修改平台式外壳样式"],
    ownerPath: "application/shell/platform-shell.css",
    projectOwnerPath: "application/shell/platform-shell.css",
    optional: true,
  },
  {
    id: "appearance.assistant-panel-width",
    kind: "application_config",
    name: "Floating assistant panel width",
    description: "Project-owned outer floating chat panel width in pixels. In assistant mode, adjust this for a wider/narrower chat area; AppUIModel controls only the inner layout. The panel remains clamped to the viewport.",
    intents: ["make chat area wider", "change floating assistant width", "聊天区域太窄，调宽一点", "调整悬浮聊天面板宽度"],
    ownerPath: "appearance/shell-config.ts",
    optional: true,
  },
  {
    id: "conversation.starter-suggestions",
    kind: "application_config",
    name: "Conversation starter suggestions",
    description: "Application-owned starter questions shown in the empty conversation state.",
    intents: [
      "change starter questions",
      "edit suggested prompts",
      "customize empty-state suggestions",
      "modify example questions",
      "修改推荐问题",
      "修改开场问题",
    ],
    ownerPath: "conversation/config/conversation-runtime-config.ts",
    relatedPluginIds: ["conversation-suggestions"],
  },
  {
    id: "conversation.welcome",
    kind: "application_config",
    name: "Conversation welcome content",
    description: "Application-owned welcome title and description for an empty conversation.",
    intents: [
      "change welcome text",
      "edit conversation welcome title",
      "customize empty-state welcome copy",
      "修改欢迎语",
      "修改欢迎标题和说明",
    ],
    ownerPath: "conversation/config/conversation-presentation-config.ts",
    relatedPluginIds: ["conversation-surface"],
  },
  {
    id: "theme.brand-palette",
    kind: "application_config",
    name: "Agent UI brand colors and visual styling",
    description: "Customize Agent UI brand colors, surfaces, radius and shadows in this project stylesheet. Read ../theme/theme-customization.md for public tokens, scope, cascade and derived colors. Ordinary scoped application CSS editing needs no source takeover. Preserve npm imports, vendor and Host CSS. Presets are light/dark/violet; blue is a palette, not a preset.",
    intents: ["change brand colors", "customize theme palette", "make the assistant blue and white", "simplify visual styling", "紫色换蓝白配色", "企业配色，整体简洁一点"],
    ownerPath: "conversation/styles.css",
    optional: true,
    relatedPluginIds: ["theme-provider"],
  },
] as const satisfies readonly CreatorApplicationAuthoringTarget[];
