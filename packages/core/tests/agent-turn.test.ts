import { describe, expect, it } from "vitest";

import {
  projectAgentTurns,
  type AgentMessage,
} from "../src/index.js";

const root = { type: "root" } as const;

function user(id: string, content = id): AgentMessage {
  return { id, producer: root, role: "user", content };
}

function assistant(
  id: string,
  content: string | undefined = id,
): AgentMessage {
  return { id, producer: root, role: "assistant", content };
}

describe("projectAgentTurns", () => {
  it("uses each user message as the only turn boundary", () => {
    const userA = user("user-a");
    const assistantA1 = assistant("assistant-a-1");
    const assistantA2 = assistant("assistant-a-2");
    const userB = user("user-b");
    const assistantB = assistant("assistant-b");

    const projection = projectAgentTurns([
      userA,
      assistantA1,
      assistantA2,
      userB,
      assistantB,
    ]);

    expect(projection.leadingMessages).toEqual([]);
    expect(projection.turns).toEqual([
      {
        id: "user-a",
        userMessage: userA,
        responseMessages: [assistantA1, assistantA2],
      },
      {
        id: "user-b",
        userMessage: userB,
        responseMessages: [assistantB],
      },
    ]);
  });

  it("keeps tool, reasoning and activity messages inside the initiating turn", () => {
    const toolCallMessage: AgentMessage = {
      id: "assistant-tool-call",
      producer: root,
      role: "assistant",
      toolCalls: [
        {
          id: "tool-call-1",
          type: "function",
          function: { name: "inspect", arguments: "{}" },
        },
      ],
    };
    const toolMessage: AgentMessage = {
      id: "tool-result",
      producer: root,
      role: "tool",
      toolCallId: "tool-call-1",
      content: "done",
    };
    const reasoningMessage: AgentMessage = {
      id: "reasoning",
      producer: root,
      role: "reasoning",
      content: "checking",
    };
    const activityMessage: AgentMessage = {
      id: "activity",
      producer: root,
      role: "activity",
      activityType: "progress",
      content: { progress: 100 },
    };
    const finalMessage = assistant("assistant-final", "finished");

    const projection = projectAgentTurns([
      user("user-turn"),
      toolCallMessage,
      toolMessage,
      reasoningMessage,
      activityMessage,
      finalMessage,
    ]);

    expect(projection.turns).toHaveLength(1);
    expect(projection.turns[0]?.responseMessages).toEqual([
      toolCallMessage,
      toolMessage,
      reasoningMessage,
      activityMessage,
      finalMessage,
    ]);
  });

  it("does not split a turn when the producer changes", () => {
    const rootReply = assistant("root-reply");
    const subagentReply: AgentMessage = {
      id: "subagent-reply",
      producer: { type: "subagent", id: "search-agent" },
      role: "assistant",
      content: "found it",
    };
    const rootFinal = assistant("root-final");

    const projection = projectAgentTurns([
      user("user-turn"),
      rootReply,
      subagentReply,
      rootFinal,
    ]);

    expect(projection.turns).toHaveLength(1);
    expect(projection.turns[0]?.responseMessages).toEqual([
      rootReply,
      subagentReply,
      rootFinal,
    ]);
  });

  it("preserves messages before the first user message", () => {
    const systemMessage: AgentMessage = {
      id: "system",
      producer: root,
      role: "system",
      content: "system context",
    };
    const assistantMessage = assistant("assistant");

    const projection = projectAgentTurns([
      systemMessage,
      user("user-turn"),
      assistantMessage,
    ]);

    expect(projection.leadingMessages).toEqual([systemMessage]);
    expect(projection.turns).toHaveLength(1);
  });

  it("creates consecutive empty turns for consecutive user messages", () => {
    const projection = projectAgentTurns([user("user-a"), user("user-b")]);

    expect(projection.turns.map((turn) => turn.id)).toEqual([
      "user-a",
      "user-b",
    ]);
    expect(projection.turns.map((turn) => turn.responseMessages)).toEqual([
      [],
      [],
    ]);
  });

  it("keeps the turn id stable when streaming content updates in place", () => {
    const before = projectAgentTurns([
      user("user-turn"),
      {
        ...assistant("assistant-stream", "partial"),
        streamStatus: "streaming",
      },
    ]);
    const after = projectAgentTurns([
      user("user-turn"),
      {
        ...assistant("assistant-stream", "complete"),
        streamStatus: "completed",
      },
    ]);

    expect(before.turns[0]?.id).toBe("user-turn");
    expect(after.turns[0]?.id).toBe("user-turn");
    expect(before.turns[0]?.responseMessages[0]?.id).toBe("assistant-stream");
    expect(after.turns[0]?.responseMessages[0]?.id).toBe("assistant-stream");
  });
});
