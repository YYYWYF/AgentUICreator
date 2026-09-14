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
} from "../agent-ui/conversation/threads/conversation-history-projector";
import { mockConversationFixtures } from "../dev-mock/conversations/fixtures";

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

  it("projects the dedicated Subagents replay as three terminal dispatch calls", () => {
    const fixture = mockConversationFixtures.find(
      (candidate) => candidate.detail.id === "conversation-replay-subagents",
    );
    if (fixture === undefined || fixture.detail.replay === undefined) {
      throw new Error("Dedicated Subagents replay fixture is missing.");
    }

    const messages = projectConversationReplay(fixture.detail.replay);
    const assistant = messages.find(
      (message) => message.id === "replay-subagents-assistant",
    );
    if (assistant?.role !== "assistant") {
      throw new Error("Subagents replay assistant message is missing.");
    }

    const dispatches = assistant.content.filter(
      (part): part is Record<string, unknown> & {
        type: "tool-call";
        toolName: string;
        result?: unknown;
      } =>
        part.type === "tool-call" && typeof part.toolName === "string",
    );
    expect(dispatches).toHaveLength(3);
    expect(dispatches.map((part) => part.toolName)).toEqual([
      "mock_dispatch_subagent",
      "mock_dispatch_subagent",
      "mock_dispatch_subagent",
    ]);
    expect(dispatches.map((part) => part.result)).toEqual([
      expect.objectContaining({ status: "completed", progress: 100 }),
      expect.objectContaining({ status: "completed", progress: 100 }),
      expect.objectContaining({ status: "completed", progress: 100 }),
    ]);
    expect(assistant.status).toEqual({ type: "complete", reason: "stop" });
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

  it("projects system and developer replay messages into one text part", () => {
    const replay: ConversationReplay = {
      version: 1,
      messages: [
        {
          id: "system-1",
          role: "system",
          parts: [
            { type: "text", text: "line one" },
            { type: "text", text: "line two" },
          ],
        },
        {
          id: "developer-1",
          role: "developer",
          parts: [
            { type: "text", text: "developer one" },
            { type: "text", text: "developer two" },
          ],
        },
      ],
    };

    const [system, developer] = projectConversationReplay(replay);
    expect(system).toMatchObject({
      id: "system-1",
      role: "system",
      content: [{ type: "text", text: "line one\nline two" }],
    });
    expect(system?.role === "system" ? system.content : []).toHaveLength(1);
    expect(developer).toMatchObject({
      id: "developer-1",
      role: "system",
      content: [{ type: "text", text: "developer one\ndeveloper two" }],
      metadata: { custom: { originalRole: "developer" } },
    });
    expect(developer?.role === "system" ? developer.content : []).toHaveLength(1);
  });

  it("accepts only JSON-safe replay values across rich fields", () => {
    const validReplay = {
      version: 1,
      messages: [{
        id: "assistant-json",
        role: "assistant",
        parts: [{
          type: "tool-call",
          toolCallId: "tool-json",
          toolName: "search_files",
          args: {
            string: "x",
            number: 1,
            boolean: true,
            nil: null,
            array: [1, "x"],
            object: { ok: true },
          },
          result: {
            string: "x",
            number: 1,
            boolean: true,
            nil: null,
            array: [1, "x"],
            object: { ok: true },
          },
        }],
        status: {
          type: "incomplete",
          reason: "error",
          error: { ok: true },
        },
        metadata: { ok: true },
      }],
    };

    expect(conversationReplaySchema.safeParse(validReplay).success).toBe(true);

    for (const value of [() => undefined, Symbol("not-json"), new Date()]) {
      const invalidReplay = {
        version: 1,
        messages: [{
          id: "assistant-invalid-json",
          role: "assistant",
          parts: [{
            type: "tool-call",
            toolCallId: "tool-invalid-json",
            toolName: "search_files",
            args: { value },
            result: value,
          }],
          status: { type: "incomplete", reason: "error", error: value },
          metadata: { value },
        }],
      };
      expect(conversationReplaySchema.safeParse(invalidReplay).success).toBe(false);
    }
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
