import { parseAppUIModel, type AppUIModel } from "../../../framework/contracts/app-ui-model";

export const ASSISTANT_UI_SPIKE_INSTANCE_ID =
  "assistant-ui-conversation-spike-main";
export const CONVERSATION_SURFACE_INSTANCE_ID =
  "agent-conversation-surface-main";

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

  return parseAppUIModel({
    ...model,
    pluginInstances: {
      ...model.pluginInstances,
      [CONVERSATION_SURFACE_INSTANCE_ID]: {
        ...conversationSurface,
        enabled: false,
      },
      [ASSISTANT_UI_SPIKE_INSTANCE_ID]: {
        ...assistantUiSpike,
        enabled: true,
      },
    },
  });
}
