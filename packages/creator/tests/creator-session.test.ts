import { describe, expect, it, vi } from "vitest";

import {
  CreatorModelProtocolError,
  CreatorSession,
  finalCreatorMessage,
} from "../src/index.js";

describe("finalCreatorMessage", () => {
  it("reads the final assistant text", () => {
    expect(
      finalCreatorMessage({
        messages: [
          { role: "user", content: "Change the layout" },
          { role: "assistant", content: "Updated the right panel." },
        ],
      }),
    ).toBe("Updated the right panel.");
  });

  it("rejects text-encoded tool calls from incompatible endpoints", () => {
    expect(() =>
      finalCreatorMessage({
        messages: [
          {
            role: "assistant",
            content: "<tool_call><function=read_file></function></tool_call>",
          },
        ],
      }),
    ).toThrow(CreatorModelProtocolError);
  });
});

describe("CreatorSession", () => {
  it("retains concise conversation context across requests", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        messages: [{ role: "assistant", content: "Added the panel." }],
      })
      .mockResolvedValueOnce({
        messages: [{ role: "assistant", content: "Reduced its width." }],
      });
    const session = new CreatorSession(invoke);

    await session.run("Add a panel");
    await session.run("Make it narrower");

    expect(invoke.mock.calls[1]?.[0]).toEqual([
      { role: "user", content: "Add a panel" },
      { role: "assistant", content: "Added the panel." },
      { role: "user", content: "Make it narrower" },
    ]);
  });

  it("returns the tool-produced modification receipt", async () => {
    const receipt = {
      files: [
        {
          path: "plugins/chat/styles.css",
          status: "modified" as const,
          diff: "--- a/plugins/chat/styles.css\n+++ b/plugins/chat/styles.css",
          truncated: false,
        },
      ],
      validations: [
        {
          command: "pnpm typecheck",
          status: "passed" as const,
          exitCode: 0,
          output: "typecheck passed",
          truncated: false,
        },
      ],
    };
    const session = new CreatorSession(
      vi.fn().mockResolvedValue({
        messages: [{ role: "assistant", content: "Updated the chat layout." }],
        receipt,
      }),
    );

    await expect(session.run("Swap the message sides")).resolves.toEqual({
      message: "Updated the chat layout.",
      receipt,
    });
  });

  it("streams text deltas and keeps the final response in conversation history", async () => {
    const invoke = vi.fn().mockResolvedValue({
      messages: [{ role: "assistant", content: "Follow-up complete." }],
    });
    const streamInvoke = vi.fn(async (_messages, observer) => {
      observer.onTextMessageStart("message-1");
      observer.onTextMessageContent("message-1", "**Updated");
      observer.onTextMessageContent("message-1", " successfully**");
      observer.onTextMessageEnd("message-1");
      return {
        messages: [
          { role: "assistant", content: "**Updated successfully**" },
        ],
      };
    });
    const session = new CreatorSession(invoke, streamInvoke);
    const events: string[] = [];

    await expect(
      session.stream("Update the UI", {
        onTextMessageStart(messageId) {
          events.push(`start:${messageId}`);
        },
        onTextMessageContent(messageId, delta) {
          events.push(`content:${messageId}:${delta}`);
        },
        onTextMessageEnd(messageId) {
          events.push(`end:${messageId}`);
        },
      }),
    ).resolves.toEqual({ message: "**Updated successfully**" });

    expect(events).toEqual([
      "start:message-1",
      "content:message-1:**Updated",
      "content:message-1: successfully**",
      "end:message-1",
    ]);

    await session.run("Continue");
    expect(invoke).toHaveBeenCalledWith([
      { role: "user", content: "Update the UI" },
      { role: "assistant", content: "**Updated successfully**" },
      { role: "user", content: "Continue" },
    ]);
  });
});
