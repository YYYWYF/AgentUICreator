import { HttpAgent } from "@ag-ui/client";
import { EventType, RunAgentInputSchema } from "@ag-ui/core";
import { describe, expect, it, vi } from "vitest";

import { formatCreatorAgUiEvent } from "../src/vitePlugin.js";

describe("Creator AG-UI stream", () => {
  it("sends the previous user request and streamed clarification on the next run", async () => {
    const requests: ReturnType<typeof RunAgentInputSchema.parse>[] = [];
    const question = "已有 session-manager，你想恢复还是新建？";
    const fetch = vi.fn(async (_url: string, request: RequestInit) => {
      const input = RunAgentInputSchema.parse(JSON.parse(String(request.body)));
      requests.push(input);
      const messageId = `assistant-${requests.length}`;
      const events = [
        { type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId },
        { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" as const },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: requests.length === 1 ? question : "明白，恢复已有插件。",
        },
        { type: EventType.TEXT_MESSAGE_END, messageId },
        { type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId },
      ];
      return new Response(events.map(formatCreatorAgUiEvent).join(""), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    // Match CreatorWorkbench: keep one HttpAgent and add only the new user message.
    const agent = new HttpAgent({
      url: "http://creator.test/run",
      threadId: "creator-thread",
      fetch,
    });
    agent.addMessage({ id: "user-1", role: "user", content: "我要历史会话功能" });
    await agent.runAgent({});
    agent.addMessage({ id: "user-2", role: "user", content: "第一个" });
    await agent.runAgent({});

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(requests[1]?.threadId).toBe(requests[0]?.threadId);
    expect(requests[1]?.messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: "user", content: "我要历史会话功能" },
      { role: "assistant", content: question },
      { role: "user", content: "第一个" },
    ]);
  });

  it("is consumed by the official HttpAgent as tool activity, incremental text, and a receipt", async () => {
    const receipt = {
      files: [
        {
          path: "plugins/chat/styles.css",
          status: "modified" as const,
          diff: "--- a/plugins/chat/styles.css\n+++ b/plugins/chat/styles.css",
          truncated: false,
        },
      ],
      validations: [],
    };
    const encoder = new TextEncoder();
    const fetch = vi.fn(async (_url: string, request: RequestInit) => {
      const input = RunAgentInputSchema.parse(JSON.parse(String(request.body)));
      expect(input.messages.at(-1)).toMatchObject({
        role: "user",
        content: "Render the response as Markdown",
      });
      const events = [
        {
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
        },
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: "tool-call-1",
          toolCallName: "read_file",
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: "tool-call-1",
          delta: '{"file_path":"/project/app-ui/app-ui.json"}',
        },
        {
          type: EventType.TOOL_CALL_END,
          toolCallId: "tool-call-1",
        },
        {
          type: EventType.TOOL_CALL_RESULT,
          messageId: "tool-result-1",
          toolCallId: "tool-call-1",
          role: "tool",
          content: "{\"version\":\"1\"}",
          metadata: { status: "finished" },
        },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: "assistant-message",
          role: "assistant",
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: "assistant-message",
          delta: "**Streamed",
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: "assistant-message",
          delta: " response**",
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: "assistant-message",
        },
        {
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
          outcome: { type: "success" },
          result: { receipt },
        },
      ];
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const event of events) {
            controller.enqueue(encoder.encode(formatCreatorAgUiEvent(event)));
          }
          controller.close();
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    const agent = new HttpAgent({
      url: "http://creator.test/run",
      threadId: "creator-thread",
      fetch,
    });
    agent.addMessage({
      id: "user-message",
      role: "user",
      content: "Render the response as Markdown",
    });
    const deltas: string[] = [];
    const toolEvents: string[] = [];

    const result = await agent.runAgent({}, {
      onTextMessageContentEvent({ event }) {
        deltas.push(event.delta);
      },
      onToolCallStartEvent({ event }) {
        toolEvents.push(`start:${event.toolCallName}`);
      },
      onToolCallArgsEvent({ event }) {
        toolEvents.push(`args:${event.delta}`);
      },
      onToolCallEndEvent({ event }) {
        toolEvents.push(`end:${event.toolCallId}`);
      },
      onToolCallResultEvent({ event }) {
        toolEvents.push(`result:${event.content}`);
      },
    });

    expect(deltas).toEqual(["**Streamed", " response**"]);
    expect(toolEvents).toEqual([
      "start:read_file",
      'args:{"file_path":"/project/app-ui/app-ui.json"}',
      "end:tool-call-1",
      'result:{"version":"1"}',
    ]);
    expect(result.newMessages).toContainEqual(
      expect.objectContaining({
        role: "assistant",
        toolCalls: [
          expect.objectContaining({
            id: "tool-call-1",
            function: {
              name: "read_file",
              arguments: '{"file_path":"/project/app-ui/app-ui.json"}',
            },
          }),
        ],
      }),
    );
    expect(result.newMessages).toContainEqual({
      id: "tool-result-1",
      role: "tool",
      toolCallId: "tool-call-1",
      content: '{"version":"1"}',
      metadata: { status: "finished" },
    });
    expect(result.newMessages).toContainEqual({
      id: "assistant-message",
      role: "assistant",
      content: "**Streamed response**",
    });
    expect(result.result).toEqual({ receipt });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
