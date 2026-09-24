import type { AgentUIModeDefinition } from "../contracts/agent-ui-mode";

export const embeddedMode: AgentUIModeDefinition = {
  id: "embedded",
  workspace: {
    regions: {
      center: {
        required: true,
        track: "minmax(0, 1fr)",
      },
    },
  },
  defaultPresetId: "embedded/default",
};
