import { parseAppUIModel } from "../contracts/app-ui-model";
import type { AgentUIPresetDefinition } from "./types";
import assistantAppUIModel from "../../presets/assistant/app-ui.json";

export const assistantDefaultPreset: AgentUIPresetDefinition = {
  id: "assistant/default",
  mode: "assistant",
  sourceItems: ["foundation/conversation"],
  createAppUIModel: () =>
    parseAppUIModel(structuredClone(assistantAppUIModel)),
};
