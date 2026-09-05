import type { Message } from "@ag-ui/core";
import type { AgentMessage, AgentMessagePart } from "@agent-ui/runtime-core";

function mapContentPart(
  part: Extract<Extract<Message, { role: "user" }>["content"], unknown[]>[number],
): AgentMessagePart {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }

  return {
    type: part.type,
    ...("filename" in part && part.filename !== undefined
      ? { filename: part.filename }
      : {}),
    ...("url" in part && part.url !== undefined ? { url: part.url } : {}),
    ...("source" in part
      ? {
          source: {
            type: part.source.type,
            value: part.source.value,
            ...(part.source.mimeType === undefined
              ? {}
              : { mimeType: part.source.mimeType }),
          },
        }
      : {}),
    ...("metadata" in part && part.metadata !== undefined
      ? { metadata: structuredClone(part.metadata) }
      : {}),
  };
}

/** Explicit projection: never pass an SDK message object into a UI snapshot. */
export function mapAgUiMessage(message: Message): AgentMessage {
  const base = {
    id: message.id,
    ...(message.metadata === undefined
      ? {}
      : { metadata: structuredClone(message.metadata) }),
  };

  switch (message.role) {
    case "user":
      return {
        ...base,
        role: "user",
        content: typeof message.content === "string"
          ? message.content
          : message.content.map(mapContentPart),
      };
    case "assistant":
      return {
        ...base,
        role: "assistant",
        ...(message.content === undefined ? {} : { content: message.content }),
        ...(message.toolCalls === undefined ? {} : {
          toolCalls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function" as const,
            function: {
              name: call.function.name,
              arguments: call.function.arguments,
            },
          })),
        }),
      };
    case "tool":
      return {
        ...base,
        role: "tool",
        toolCallId: message.toolCallId,
        content: message.content,
        ...(message.error === undefined ? {} : { error: message.error }),
      };
    case "activity":
      return {
        ...base,
        role: "activity",
        activityType: message.activityType,
        content: structuredClone(message.content),
      };
    case "system":
    case "developer":
    case "reasoning":
      return { ...base, role: message.role, content: message.content };
  }
}
