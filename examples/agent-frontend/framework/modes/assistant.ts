import type { AgentUIModeDefinition } from "../contracts/agent-ui-mode";

export const assistantMode: AgentUIModeDefinition = {
  id: "assistant",
  workspace: {
    regions: {
      center: {
        required: true,
        track: "minmax(0, 1fr)",
      },
    },
  },
  defaultPresetId: "assistant/default",
};
