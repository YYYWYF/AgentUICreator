import { parseAppUIModel } from "../contracts/app-ui-model";
import type { AgentUIPresetDefinition } from "./types";
import platformAppUIModel from "../../presets/platform/app-ui.json";

export const platformDefaultPreset: AgentUIPresetDefinition = {
  id: "platform/default",
  mode: "platform",
  sourceItems: ["foundation/conversation"],
  createAppUIModel: () =>
    parseAppUIModel(structuredClone(platformAppUIModel)),
};
