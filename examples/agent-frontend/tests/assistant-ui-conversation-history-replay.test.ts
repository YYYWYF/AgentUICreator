import { describe, expect, it } from "vitest";

import {
  conversationReplaySchema,
  type ConversationDetail,
  type ConversationReplay,
} from "../services/conversations";
import {
  projectConversationDetail,
  projectConversationHistory,
  projectConversationReplay,
} from "../agent-ui/adapters/assistant-ui/threads/conversation-history-projector";

describe("assistant-ui conversation history replay projector", () => {
  it("keeps legacy text-only details on the existing projection", () => {
    const detail: ConversationDetail = {
      id: "legacy-1",
      title: "Legacy",
      messages: [
        {
          id: "legacy-user",
          producer: { type: "root" },
          role: "user",
          content: "Hello",
        },
        {
          id: "legacy-assistant",
          producer: { type: "root" },
          role: "assistant",
          content: "Hi",
        },
      ],
    };

    expect(projectConversationDetail(detail)).toEqual(
      projectConversationHistory(detail.messages),
    );
  });

  it("projects reasoning as a completed assistant part and preserves tool identity", () => {
    const replay: ConversationReplay = {
      version: 1,
      messages: [{
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "Think" },
          {
            type: "tool-call",
            toolCallId: "tool-1",
            toolName: "search_files",
            args: { keyword: "AG-UI" },
            result: { files: ["src/runtime.ts"] },
            isError: false,
          },
          { type: "text", text: "Done" },
        ],
        createdAt: "2026-09-07T10:00:00Z",
      }],
    };

    const [message] = projectConversationReplay(replay);
    expect(message).toMatchObject({
      id: "assistant-1",
      role: "assistant",
      status: { type: "complete", reason: "unknown" },
      createdAt: new Date("2026-09-07T10:00:00Z"),
    });
    expect(message?.role === "assistant" ? message.content : []).toEqual([
      {
        type: "reasoning",
        text: "Think",
        status: { type: "complete" },
      },
      {
        type: "tool-call",
        toolCallId: "tool-1",
        toolName: "search_files",
        args: { keyword: "AG-UI" },
        argsText: '{"keyword":"AG-UI"}',
        result: { files: ["src/runtime.ts"] },
        isError: false,
      },
      { type: "text", text: "Done" },
    ]);
  });

  it("maps replay attachments and both official source shapes", () => {
    const replay: ConversationReplay = {
      version: 1,
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Review this" }],
          attachments: [{
            id: "file-1",
            type: "document",
            name: "notes.md",
            contentType: "text/markdown",
            url: "data:text/markdown,notes",
          }],
        },
        {
          id: "assistant-1",
          role: "assistant",
          parts: [
            {
              type: "source",
              sourceType: "url",
              id: "url-1",
              url: "https://example.com/notes",
              title: "Notes",
            },
            {
              type: "source",
              sourceType: "document",
              id: "document-1",
              title: "Architecture Notes",
              mediaType: "text/markdown",
              filename: "notes.md",
            },
          ],
        },
      ],
    };

    const [user, assistant] = projectConversationReplay(replay);
    expect(user).toMatchObject({
      role: "user",
      attachments: [{
        id: "file-1",
        status: { type: "complete" },
        content: [{
          type: "file",
          filename: "notes.md",
          data: "data:text/markdown,notes",
          mimeType: "text/markdown",
          sourceType: "url",
        }],
      }],
    });
    expect(assistant?.role === "assistant" ? assistant.content : []).toEqual([
      {
        type: "source",
        sourceType: "url",
        id: "url-1",
        url: "https://example.com/notes",
        title: "Notes",
      },
      {
        type: "source",
        sourceType: "document",
        id: "document-1",
        title: "Architecture Notes",
        mediaType: "text/markdown",
        filename: "notes.md",
      },
    ]);
  });

  it("keeps historical tool errors terminal", () => {
    const replay: ConversationReplay = {
      version: 1,
      messages: [{
        id: "assistant-error",
        role: "assistant",
        parts: [{
          type: "tool-call",
          toolCallId: "tool-error-1",
          toolName: "search_files",
          args: {},
          result: { error: "No files" },
          isError: true,
        }],
        status: { type: "incomplete", reason: "error", error: "No files" },
      }],
    };

    const [message] = projectConversationReplay(replay);
    expect(message).toMatchObject({
      role: "assistant",
      status: { type: "incomplete", reason: "error", error: "No files" },
    });
    expect(message?.role === "assistant" ? message.content[0] : undefined)
      .toMatchObject({
        type: "tool-call",
        toolCallId: "tool-error-1",
        isError: true,
      });
  });

  it("rejects non-terminal or malformed replay payloads", () => {
    expect(() => conversationReplaySchema.parse({
      version: 1,
      messages: [{
        id: "assistant-1",
        role: "assistant",
        parts: [{
          type: "tool-call",
          toolCallId: "",
          toolName: "search_files",
          args: {},
        }],
        status: { type: "running" },
      }],
    })).toThrow();
  });
});
