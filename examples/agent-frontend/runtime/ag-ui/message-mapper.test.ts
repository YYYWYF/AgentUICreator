import type { Message } from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import {
  inspectActivities,
  inspectAttachments,
  inspectReasoning,
  inspectSources,
  inspectToolCalls,
} from "../../plugins/_shared/agent-ui-data";
import { messageBelongsToConversation } from "../../plugins/antd-x-conversations/conversation-service";
import { mapAgUiMessage } from "./message-mapper";

describe("mapAgUiMessage", () => {
  it.each([
    { id: "user", role: "user", content: "Hello" },
    { id: "assistant", role: "assistant", content: "Hi" },
    { id: "system", role: "system", content: "Instructions" },
    { id: "developer", role: "developer", content: "Context" },
    { id: "tool", role: "tool", toolCallId: "call-1", content: "Result" },
  ] satisfies Message[])("maps $role messages into new frontend objects", (message) => {
    const mapped = mapAgUiMessage(message);
    expect(mapped).toEqual(message);
    expect(mapped).not.toBe(message);
  });

  it("preserves partial tool arguments, result errors and rendering hints", () => {
    const messages: Message[] = [
      {
        id: "assistant", role: "assistant",
        toolCalls: [{
          id: "call-1", type: "function",
          function: { name: "render", arguments: '{"format":' },
          encryptedValue: "sdk-replay-only",
        }],
        encryptedValue: "sdk-replay-only",
        subagentRunId: "sdk-routing-only",
      },
      {
        id: "tool", role: "tool", toolCallId: "call-1",
        content: "graph TD; A-->B", error: "Render failed",
        metadata: { agentUI: { render: "mermaid" } },
      },
    ];
    const mapped = messages.map(mapAgUiMessage);
    expect(mapped[0]).toEqual({
      id: "assistant", role: "assistant",
      toolCalls: [{ id: "call-1", type: "function", function: { name: "render", arguments: '{"format":' } }],
    });
    expect(inspectToolCalls(mapped, { status: "idle", errorMessage: undefined })).toMatchObject([
      { id: "call-1", name: "render", argumentsText: '{"format":', status: "error", result: {
        content: "graph TD; A-->B", error: "Render failed", metadata: { agentUI: { render: "mermaid" } },
      } },
    ]);
    const assistant = messages[0];
    if (assistant?.role !== "assistant") throw new Error("Missing assistant fixture");
    assistant.toolCalls![0]!.function.arguments = '{"format":"mermaid"}';
    expect(inspectToolCalls(mapped, { status: "idle", errorMessage: undefined })[0]?.argumentsText).toBe('{"format":');
  });

  it("preserves activity, reasoning, conversation metadata and sources without aliasing", () => {
    const activity: Message = {
      id: "activity", role: "activity", activityType: "analysis",
      content: { title: "Working", description: "Inspecting", progress: 50 },
      metadata: { conversationId: "history", sources: [{ title: "Reference", url: "https://example.test" }] },
    };
    const mapped = mapAgUiMessage(activity);
    const messages = [mapped, mapAgUiMessage({ id: "reasoning", role: "reasoning", content: "  Thinking  " })];
    expect(inspectActivities(messages, { status: "running", errorMessage: undefined })).toMatchObject([
      { title: "Working", description: "Inspecting", activityType: "analysis", status: "loading" },
    ]);
    expect(inspectReasoning(messages)).toEqual(["Thinking"]);
    expect(messageBelongsToConversation(mapped, "history")).toBe(true);
    expect(messageBelongsToConversation(mapped, "current")).toBe(false);
    expect(inspectSources(messages, {})).toMatchObject([{ title: "Reference", url: "https://example.test" }]);
    activity.content.title = "Changed";
    activity.metadata!.conversationId = "changed";
    expect(mapped).toMatchObject({ content: { title: "Working" }, metadata: { conversationId: "history" } });
  });

  it("preserves user text and the attachment fields displayed by plugins", () => {
    const mapped = mapAgUiMessage({
      id: "user-files", role: "user",
      content: [
        { type: "text", text: "Inspect these" },
        { type: "image", source: { type: "url", value: "https://example.test/image.png" }, metadata: { filename: "image.png" } },
        { type: "binary", mimeType: "application/pdf", url: "https://example.test/report.pdf", filename: "report.pdf" },
      ],
    });
    expect(mapped).toMatchObject({ content: [{ type: "text", text: "Inspect these" }, { type: "image" }, { type: "binary" }] });
    expect(inspectAttachments([mapped], {})).toMatchObject([
      { name: "image.png", url: "https://example.test/image.png", cardType: "image" },
      { name: "report.pdf", url: "https://example.test/report.pdf", cardType: "file" },
    ]);
  });
});
