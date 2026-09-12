import { parseAppUIModel, type AppUIModel } from "../framework/contracts/app-ui-model";

export type ConversationRuntimeMode = "assistant-ui" | "legacy";

export interface ResolveConversationRuntimeModeOptions {
  isDev: boolean;
  search: string;
}

export const CONVERSATION_SURFACE_INSTANCE_ID =
  "agent-conversation-surface-main";
export const LEGACY_CONVERSATION_LIST_INSTANCE_ID =
  "agent-conversations-main";
export const ASSISTANT_UI_THREAD_LIST_INSTANCE_ID =
  "assistant-ui-thread-list-main";
export const ASSISTANT_UI_SPIKE_INSTANCE_ID =
  "assistant-ui-conversation-spike-main";

export const LEGACY_PRESENTATION_INSTANCE_IDS = [
  "agent-welcome-main",
  "agent-prompts-main",
  "agent-sender-main",
  "agent-messages-main",
  "agent-reasoning-main",
  "agent-message-attachments-main",
  "agent-tool-activity-main",
  "agent-tool-message-main",
] as const;

export function resolveConversationRuntimeMode({
  isDev,
  search,
}: ResolveConversationRuntimeModeOptions): ConversationRuntimeMode {
  if (!isDev) {
    return "assistant-ui";
  }

  const legacyRequested =
    new URLSearchParams(search).get("legacyRuntime") === "1";

  return legacyRequested ? "legacy" : "assistant-ui";
}

export function applyLegacyRuntimeComposition(
  model: AppUIModel,
  enabled: boolean,
): AppUIModel {
  if (!enabled) {
    return model;
  }

  const conversationSurface =
    model.pluginInstances[CONVERSATION_SURFACE_INSTANCE_ID];
  const legacyConversationList =
    model.pluginInstances[LEGACY_CONVERSATION_LIST_INSTANCE_ID];
  const assistantUiThreadList =
    model.pluginInstances[ASSISTANT_UI_THREAD_LIST_INSTANCE_ID];

  if (
    conversationSurface === undefined ||
    legacyConversationList === undefined ||
    assistantUiThreadList === undefined
  ) {
    throw new Error(
      "Conversation surface or runtime mode instances are missing from AppUIModel.",
    );
  }

  const pluginInstances = {
    ...model.pluginInstances,
    [CONVERSATION_SURFACE_INSTANCE_ID]: {
      ...conversationSurface,
      enabled: true,
    },
    [LEGACY_CONVERSATION_LIST_INSTANCE_ID]: {
      ...legacyConversationList,
      enabled: true,
    },
    [ASSISTANT_UI_THREAD_LIST_INSTANCE_ID]: {
      ...assistantUiThreadList,
      enabled: false,
    },
  };

  const assistantUiSpike = pluginInstances[ASSISTANT_UI_SPIKE_INSTANCE_ID];
  if (assistantUiSpike !== undefined) {
    pluginInstances[ASSISTANT_UI_SPIKE_INSTANCE_ID] = {
      ...assistantUiSpike,
      enabled: false,
    };
  }

  for (const instanceId of LEGACY_PRESENTATION_INSTANCE_IDS) {
    const instance = pluginInstances[instanceId];
    if (instance === undefined) {
      throw new Error(
        `Legacy presentation instance "${instanceId}" is missing from AppUIModel.`,
      );
    }

    pluginInstances[instanceId] = {
      ...instance,
      enabled: true,
    };
  }

  return parseAppUIModel({
    ...model,
    pluginInstances,
  });
}
