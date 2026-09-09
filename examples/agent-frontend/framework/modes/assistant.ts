import { parseAppUIModel } from "../contracts/app-ui-model";
import type { AgentUIModeDefinition } from "../contracts/agent-ui-mode";

export const assistantMode: AgentUIModeDefinition = {
  id: "assistant",
  createInitialAppUIModel: () =>
    parseAppUIModel({
      version: "2",
      root: {
        type: "column",
        id: "assistant-root",
        children: [
          {
            type: "slot",
            id: "assistant-conversation-slot-node",
            slotId: "assistant.conversation",
          },
          {
            type: "slot",
            id: "assistant-composer-slot-node",
            slotId: "assistant.composer",
          },
        ],
        gap: 0,
        sizes: ["minmax(0, 1fr)", "auto"],
      },
      pluginInstances: {
        "assistant-messages-main": {
          id: "assistant-messages-main",
          pluginId: "antd-x-message-list",
          enabled: true,
          mount: { slotId: "assistant.conversation" },
        },
        "assistant-composer-main": {
          id: "assistant-composer-main",
          pluginId: "agent-composer",
          enabled: true,
          mount: { slotId: "assistant.composer" },
        },
      },
    }),
};
