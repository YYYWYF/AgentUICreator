import { describe, expect, it } from "vitest";

import type { AgentMessage } from "../framework/contracts/ui-plugin";
import {
  createAgentUIConversationService,
  readConversationKey,
} from "../plugins/antd-x-conversations/conversation-service";
import { antdXMessageListPlugin } from "../plugins/antd-x-message-list/definition";
import { antdXReasoningPlugin } from "../plugins/antd-x-reasoning/definition";
import { antdXRunTimelinePlugin } from "../plugins/antd-x-run-timeline/definition";
import { antdXToolDetailPlugin } from "../plugins/antd-x-tool-detail/definition";

describe("Ant Design X conversation adapter", () => {
  it("reads non-blank conversation keys", () => {
    expect(readConversationKey("current")).toBe("current");
    expect(readConversationKey("  ")).toBeUndefined();
    expect(readConversationKey(null)).toBeUndefined();
  });

  it("filters tagged history without hiding live untagged messages", () => {
    const messages: AgentMessage[] = [
      {
        id: "current",
        role: "assistant",
        content: "Current",
        metadata: { conversationId: "current" },
      },
      {
        id: "illustration",
        role: "assistant",
        content: "Illustration",
        metadata: { conversationId: "illustration" },
      },
      { id: "live", role: "assistant", content: "Live" },
    ];
    const currentService = createAgentUIConversationService("current");
    const illustrationService =
      createAgentUIConversationService("illustration");
    const current = messages.filter((message) =>
      currentService.includesMessage(message),
    );
    const illustration = messages.filter((message) =>
      illustrationService.includesMessage(message),
    );

    expect(current.map((message) => message.id)).toEqual(["current", "live"]);
    expect(illustration.map((message) => message.id)).toEqual([
      "illustration",
      "live",
    ]);
  });

  it("keeps conversation filtering optional for single-conversation apps", () => {
    expect(antdXMessageListPlugin.inject).toBeUndefined();
    expect(antdXRunTimelinePlugin.inject).toBeUndefined();
    expect(antdXToolDetailPlugin.inject).toBeUndefined();
    expect(antdXReasoningPlugin.inject).toBeUndefined();
  });
});
