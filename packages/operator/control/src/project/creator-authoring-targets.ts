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
}

export const creatorApplicationAuthoringTargets = [
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
  {
    id: "theme.default-mode",
    kind: "application_config",
    name: "Application default theme mode",
    description: "Application-owned default theme mode used when the UI starts.",
    intents: [
      "change default theme",
      "start in dark mode",
      "change application theme default",
    ],
    ownerPath: "theme/theme-config.ts",
    relatedPluginIds: ["theme-provider"],
  },
] as const satisfies readonly CreatorApplicationAuthoringTarget[];
