import { parseAppUIModel, type AppUIModel } from "../../../framework/contracts/app-ui-model";

export const ASSISTANT_UI_SPIKE_INSTANCE_ID =
  "assistant-ui-conversation-spike-main";
export const CONVERSATION_SURFACE_INSTANCE_ID =
  "agent-conversation-surface-main";
export const ASSISTANT_UI_NATIVE_PRESENTATION_INSTANCE_IDS = [
  "agent-reasoning-main",
  "agent-message-attachments-main",
  "agent-tool-message-main",
] as const;
export const ASSISTANT_UI_ADAPTED_PRESENTATION_INSTANCE_IDS = [
  "agent-welcome-main",
  "agent-prompts-main",
] as const;

export function isAssistantUiSpikeRequested(search: string): boolean {
  return new URLSearchParams(search).get("assistantUiSpike") === "1";
}

export function applyAssistantUiSpikeMode(
  model: AppUIModel,
  enabled: boolean,
): AppUIModel {
  if (!enabled) return model;

  const conversationSurface =
    model.pluginInstances[CONVERSATION_SURFACE_INSTANCE_ID];
  const assistantUiSpike =
    model.pluginInstances[ASSISTANT_UI_SPIKE_INSTANCE_ID];

  if (conversationSurface === undefined || assistantUiSpike === undefined) {
    throw new Error(
      "assistant-ui Spike instances are missing from AppUIModel.",
    );
  }

  const pluginInstances = {
    ...model.pluginInstances,
    [CONVERSATION_SURFACE_INSTANCE_ID]: {
      ...conversationSurface,
      enabled: true,
    },
    [ASSISTANT_UI_SPIKE_INSTANCE_ID]: {
      ...assistantUiSpike,
      enabled: false,
    },
  };

  for (const instanceId of [
    ...ASSISTANT_UI_NATIVE_PRESENTATION_INSTANCE_IDS,
    ...ASSISTANT_UI_ADAPTED_PRESENTATION_INSTANCE_IDS,
  ]) {
    const instance = pluginInstances[instanceId];
    if (instance === undefined) {
      throw new Error(
        `assistant-ui presentation instance "${instanceId}" is missing from AppUIModel.`,
      );
    }

    pluginInstances[instanceId] = {
      ...instance,
      enabled: false,
    };
  }

  return parseAppUIModel({
    ...model,
    pluginInstances,
  });
}
