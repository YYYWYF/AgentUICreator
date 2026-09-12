import type {
  AgentMessage,
  AgentMessagePart,
  AgentToolCall,
} from "@agent-ui/runtime-core";
import type {
  ThreadMessage,
  ThreadUserMessagePart,
  ToolCallMessagePart,
} from "@assistant-ui/react";

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function projectUserPart(part: ThreadUserMessagePart): AgentMessagePart {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text };
    case "image":
      return {
        type: "image",
        ...(part.filename === undefined ? {} : { filename: part.filename }),
        url: part.image,
      };
    case "file":
      return {
        type: "document",
        ...(part.filename === undefined ? {} : { filename: part.filename }),
        source: {
          type: part.sourceType ?? "data",
          value: part.data,
          mimeType: part.mimeType,
        },
      };
    case "audio":
      return {
        type: "audio",
        source: {
          type: "data",
          value: part.audio.data,
          mimeType: `audio/${part.audio.format}`,
        },
      };
    case "data":
      return { type: "data", metadata: structuredClone(part.data) };
  }
}

function projectToolCall(part: ToolCallMessagePart): AgentToolCall {
  return {
    id: part.toolCallId,
    type: "function",
    function: {
      name: part.toolName,
      arguments: part.argsText || stringify(part.args),
    },
  };
}

function projectAssistantMessage(message: Extract<ThreadMessage, { role: "assistant" }>): AgentMessage[] {
  const projected: AgentMessage[] = [];
  const reasoning = message.content.filter((part) => part.type === "reasoning");
  for (const [index, part] of reasoning.entries()) {
    projected.push({
      id: `${message.id}:reasoning:${index}`,
      role: "reasoning",
      producer: { type: "root" },
      content: part.text,
      streamStatus: message.status.type === "running" ? "streaming" : "completed",
    });
  }

  const text = message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  const toolParts = message.content.filter(
    (part): part is ToolCallMessagePart => part.type === "tool-call",
  );
  projected.push({
    id: message.id,
    role: "assistant",
    producer: { type: "root" },
    ...(text.length === 0 ? {} : { content: text }),
    ...(toolParts.length === 0
      ? {}
      : { toolCalls: toolParts.map(projectToolCall) }),
    streamStatus: message.status.type === "running" ? "streaming" : "completed",
  });

  for (const part of toolParts) {
    if (part.result === undefined) continue;
    projected.push({
      id: `${message.id}:tool-result:${part.toolCallId}`,
      role: "tool",
      producer: { type: "root" },
      toolCallId: part.toolCallId,
      content: stringify(part.result),
      ...(part.isError ? { error: stringify(part.result) } : {}),
    });
  }
  return projected;
}

export function projectAssistantUiMessages(
  messages: readonly ThreadMessage[],
): AgentMessage[] {
  return messages.flatMap((message): AgentMessage[] => {
    if (message.role === "assistant") return projectAssistantMessage(message);
    if (message.role === "system") {
      return [{
        id: message.id,
        role: "system",
        producer: { type: "root" },
        content: message.content[0].text,
      }];
    }
    const content = message.content.map(projectUserPart);
    return [{
      id: message.id,
      role: "user",
      producer: { type: "root" },
      content: content.length === 1 && content[0]?.type === "text"
        ? content[0].text ?? ""
        : content,
    }];
  });
}
