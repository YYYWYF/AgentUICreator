import { parseAppUIModel } from "../contracts/app-ui-model";
import type { AgentUIModeDefinition } from "../contracts/agent-ui-mode";

export const embeddedMode: AgentUIModeDefinition = {
  id: "embedded",
  createInitialAppUIModel: () =>
    parseAppUIModel({
      version: "2",
      root: {
        type: "column",
        id: "embedded-root",
        children: [
          {
            type: "slot",
            id: "embedded-conversation-slot-node",
            slotId: "embedded.conversation",
          },
        ],
        gap: 0,
        sizes: ["minmax(0, 1fr)"],
      },
      pluginInstances: {
        "embedded-messages-main": {
          id: "embedded-messages-main",
          pluginId: "agent-message-list",
          enabled: true,
          mount: { slotId: "embedded.conversation" },
        },
      },
    }),
};
