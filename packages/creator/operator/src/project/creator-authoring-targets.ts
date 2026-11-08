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
    projectOwnerPath: "application/shell/assistant-shell.css",
    optional: true,
  },
  {
    id: "conversation.identity",
    kind: "application_config",
    name: "Assistant identity copy",
    description: "Assistant display name belongs to locales.agentIdentity.name. Edit the existing project locale binding, preserve Host field overrides and en-US/zh-CN parity. This changes presentation, not Agent backend identity.",
    intents: ["change assistant name", "rename assistant", "修改助手名字", "修改助理名称", "助手名称"],
    ownerPath: "i18n/locale-config.ts",
    projectOwnerPath: "application/locales.ts",
    relatedPluginIds: ["agent-identity"],
  },
  {
    id: "conversation.composer-copy",
    kind: "application_config",
    name: "Composer presentation copy",
    description: "Composer copy belongs to unified locales.composer: placeholder is the input hint, input is its accessible name, send is send-button copy. Edit the existing locale binding with en-US/zh-CN parity; preserve input handlers, draft and send behavior.",
    intents: ["change input placeholder", "composer copy", "修改输入框占位文字", "修改输入提示", "发送按钮文案"],
    ownerPath: "i18n/locale-config.ts",
    projectOwnerPath: "application/locales.ts",
    relatedPluginIds: ["composer", "submit-action"],
  },
  {
    id: "conversation.starter-suggestions",
    kind: "application_config",
    name: "Conversation starter suggestions",
    description: "Starter text belongs to locales.starterSuggestions (title/label/prompt). application/project-config.tsx binds these messages and controls the returned item structure, count and order. To remove descriptions, omit label from returned items; an empty required locale label falls back to default text. Keep localized title/prompt and existing sends. No Agent suggestions prop or AppUIModel text.",
    intents: [
      "change starter questions",
      "edit suggested prompts",
      "customize empty-state suggestions",
      "modify example questions",
      "修改推荐问题",
      "修改开场问题",
    ],
    ownerPath: "i18n/locale-config.ts",
    projectOwnerPath: "application/locales.ts",
    relatedPluginIds: ["conversation-suggestions"],
  },
  {
    id: "conversation.starter-structure",
    kind: "application_config",
    name: "Starter item structure and locale binding",
    description: "getConversationStarterSuggestions in this project configuration maps resolved project/Host locale messages to items. Change structure/count/order here; omit label to remove its description, preserve title/prompt. Keep text in the existing locale owner and preserve other project configuration.",
    intents: ["remove suggestion description", "starter item structure", "去掉推荐问题下面的说明", "推荐卡片副标题", "推荐问题数量和顺序"],
    ownerPath: "application/project-config.tsx",
    projectOwnerPath: "application/project-config.tsx",
    optional: true,
    relatedPluginIds: ["conversation-suggestions"],
  },
  {
    id: "conversation.welcome",
    kind: "application_config",
    name: "Conversation welcome content",
    description: "Default welcome text has one owner: locales.conversation.welcome and optional welcomeDescription (empty string hides it). In modern projects edit application/locales.ts, bound by project-config.tsx. Keep en-US/zh-CN parity. No Agent welcome prop or separate presentation config; ReactNode welcome/emptyWelcome are structural replacements, unnecessary for a text change.",
    intents: [
      "change welcome text",
      "edit conversation welcome title",
      "customize empty-state welcome copy",
      "修改欢迎语",
      "修改欢迎标题和说明",
    ],
    ownerPath: "i18n/locale-config.ts",
    projectOwnerPath: "application/locales.ts",
    relatedPluginIds: ["conversation-surface"],
  },
  {
    id: "theme.brand-palette",
    kind: "application_config",
    name: "Agent UI brand colors and visual styling",
    description: "Customize Agent UI brand colors, surfaces, radius and shadows in this project stylesheet. Read ../theme/theme-customization.md for public tokens, scope, cascade and derived colors. Ordinary scoped application CSS editing needs no source takeover. Preserve npm imports, vendor and Host CSS. Presets are light/dark/violet; blue is a palette, not a preset.",
    intents: ["change brand colors", "customize theme palette", "make the assistant blue and white", "simplify visual styling", "紫色换蓝白配色", "企业配色，整体简洁一点", "输入框圆角", "消息正文字号", "composer radius", "message body font size"],
    ownerPath: "conversation/styles.css",
    projectOwnerPath: "styles.css",
    optional: true,
    relatedPluginIds: ["theme-provider"],
  },
] as const satisfies readonly CreatorApplicationAuthoringTarget[];
