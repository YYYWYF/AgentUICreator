import { describe, expect, it } from "vitest";

import type { AgentMessage } from "../framework/contracts/ui-plugin";
import { antdXMessageListPlugin } from "../plugins/antd-x-message-list/definition";
import { antdXSenderPlugin } from "../plugins/antd-x-sender/definition";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  getConversationViewMessages,
  getVisibleConversationMessages,
} from "../services/conversations";

const liveMessages: AgentMessage[] = [
  {
    id: "live",
    producer: { type: "root" },
    role: "assistant",
    content: "Live",
  },
];
const historyMessages: AgentMessage[] = [
  {
    id: "history",
    producer: { type: "root" },
    role: "assistant",
    content: "History",
  },
  {
    id: "history-tool",
    producer: { type: "root" },
    role: "tool",
    toolCallId: "tool-1",
    content: "Hidden",
  },
];

describe("conversation view messages", () => {
  it("uses Runtime messages in live mode", () => {
    expect(
      getConversationViewMessages(liveMessages, EMPTY_CONVERSATION_SNAPSHOT)
        .map((message) => message.id),
    ).toEqual(["live"]);
  });

  it("uses only history messages in history mode", () => {
    const snapshot = {
      ...EMPTY_CONVERSATION_SNAPSHOT,
      mode: "history" as const,
      historyMessages,
      detailStatus: "ready" as const,
    };
    expect(
      getConversationViewMessages(liveMessages, snapshot)
        .map((message) => message.id),
    ).toEqual(["history", "history-tool"]);
    expect(
      getVisibleConversationMessages(liveMessages, snapshot)
        .map((message) => message.id),
    ).toEqual(["history"]);
  });

  it("makes the message list and sender hard consumers of conversation mode", () => {
    expect(antdXMessageListPlugin.inject).toEqual([
      AGENT_UI_CONVERSATION_SERVICE,
    ]);
    expect(antdXSenderPlugin.inject).toEqual([
      AGENT_UI_CONVERSATION_SERVICE,
    ]);
  });
});
