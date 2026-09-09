import platformAppUIModel from "../../app-ui/app-ui.json";
import { parseAppUIModel } from "../contracts/app-ui-model";
import type { AgentUIModeDefinition } from "../contracts/agent-ui-mode";

export const platformMode: AgentUIModeDefinition = {
  id: "platform",
  createInitialAppUIModel: () =>
    parseAppUIModel(structuredClone(platformAppUIModel)),
};
