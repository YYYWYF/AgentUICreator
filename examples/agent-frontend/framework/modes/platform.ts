import platformAppUIModel from "../../app-ui/app-ui.json";
import { parseAppUIModel } from "../contracts/app-ui-model";
import type { AgentUIModeDefinition } from "../contracts/agent-ui-mode";

export const platformMode: AgentUIModeDefinition = {
  id: "platform",
  workspace: {
    regions: {
      left: {
        required: false,
        track: "280px",
      },
      center: {
        required: true,
        track: "minmax(0, 1fr)",
      },
      right: {
        required: false,
        track: "280px",
      },
    },
  },
  createInitialAppUIModel: () =>
    parseAppUIModel(structuredClone(platformAppUIModel)),
};
