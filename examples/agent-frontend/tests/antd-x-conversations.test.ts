import { describe, expect, it } from "vitest";

import type { AgentMessage } from "../framework/contracts/ui-plugin";
import { antdXMessageListPlugin } from "../plugins/antd-x-message-list/definition";
import { agentComposerPlugin } from "../plugins/agent-composer/definition";
import {
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
    id: "history-system",
    producer: { type: "root" },
    role: "system",
    content: "Internal instructions",
  },
  {
    id: "history-developer",
    producer: { type: "root" },
    role: "developer",
    content: "Internal context",
  },
  {
    id: "history-user",
    producer: { type: "root" },
    role: "user",
    content: "Question",
  },
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
  {
    id: "history-reasoning",
    producer: { type: "root" },
    role: "reasoning",
    content: "Hidden reasoning",
  },
  {
    id: "history-activity",
    producer: { type: "root" },
    role: "activity",
    activityType: "status",
    content: { message: "Hidden activity" },
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
    ).toEqual(historyMessages.map((message) => message.id));
    expect(
      getVisibleConversationMessages(liveMessages, snapshot)
        .map((message) => message.id),
    ).toEqual(["history-user", "history"]);
  });

  it("keeps basic chat independent from conversation service", () => {
    expect(antdXMessageListPlugin.inject).toBeUndefined();
    expect(agentComposerPlugin.inject).toBeUndefined();
  });
});
