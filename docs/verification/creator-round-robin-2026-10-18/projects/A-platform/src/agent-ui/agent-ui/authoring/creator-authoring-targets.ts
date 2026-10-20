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
}

export const creatorApplicationAuthoringTargets = [
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
    relatedPluginIds: ["theme-provider", "theme-switch"],
  },
] as const satisfies readonly CreatorApplicationAuthoringTarget[];
