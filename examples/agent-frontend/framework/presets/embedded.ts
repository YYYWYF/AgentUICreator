import { parseAppUIModel } from "../contracts/app-ui-model";
import type { AgentUIPresetDefinition } from "./types";
import embeddedAppUIModel from "../../presets/embedded/app-ui.json";

export const embeddedDefaultPreset: AgentUIPresetDefinition = {
  id: "embedded/default",
  mode: "embedded",
  sourceItems: ["foundation/conversation"],
  createAppUIModel: () =>
    parseAppUIModel(structuredClone(embeddedAppUIModel)),
};
