import { describe, expect, it } from "vitest";

import {
  projectConversationDetail,
} from "../agent-ui/conversation/threads/conversation-history-projector";
import type { ConversationDetail } from "../services/conversations";

function detail(messages: readonly unknown[]): ConversationDetail {
  return {
    id: "history-1",
    title: "History",
    history: { format: "langchain", messages },
  };
}

describe("assistant-ui LangChain history projector", () => {
  it("hydrates human and ai messages through the official converter", () => {
    const messages = projectConversationDetail(detail([
      { id: "human-1", type: "human", content: "Hello" },
      { id: "ai-1", type: "ai", content: "Hi" },
    ]));

    expect(messages).toMatchObject([
      { id: "human-1", role: "user", content: [{ type: "text", text: "Hello" }] },
      { id: "ai-1", role: "assistant", content: [{ type: "text", text: "Hi" }] },
    ]);
  });

  it("joins a persisted tool result to its completed tool call", () => {
    const messages = projectConversationDetail(detail([
      { id: "human-1", type: "human", content: "Search" },
      {
        id: "ai-1",
        type: "ai",
        content: "",
        tool_calls: [{
          id: "tool-1",
          name: "search_files",
          args: { keyword: "AG-UI" },
        }],
      },
      {
        id: "tool-result-1",
        type: "tool",
        tool_call_id: "tool-1",
        name: "search_files",
        status: "success",
        content: '{"files":["runtime.ts"]}',
      },
      { id: "ai-2", type: "ai", content: "Done" },
    ]));

    expect(messages).toHaveLength(3);
    expect(messages[1]).toMatchObject({
      id: "ai-1",
      role: "assistant",
      content: expect.arrayContaining([expect.objectContaining({
        type: "tool-call",
        toolCallId: "tool-1",
        toolName: "search_files",
        result: '{"files":["runtime.ts"]}',
      })]),
    });
  });

  it("accepts an empty checkpoint history", () => {
    expect(projectConversationDetail(detail([]))).toEqual([]);
  });
});
