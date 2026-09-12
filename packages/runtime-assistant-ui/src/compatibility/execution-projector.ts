import type { AgentExecution } from "@agent-ui/runtime-core";
import type { ThreadMessage, ToolCallMessagePart } from "@assistant-ui/react";

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function projectTool(
  part: ToolCallMessagePart,
  messageId: string,
): AgentExecution {
  const status = part.result === undefined
    ? part.interrupt === undefined ? "awaiting-result" : "interrupted"
    : part.isError ? "error" : "completed";
  return {
    type: "tool",
    id: part.toolCallId,
    producer: { type: "root" },
    name: part.toolName,
    status,
    arguments: part.argsText || stringify(part.args),
    parentMessageId: messageId,
    ...(part.result === undefined
      ? {}
      : {
          result: {
            messageId: `${messageId}:tool-result:${part.toolCallId}`,
            content: stringify(part.result),
          },
        }),
    ...(part.isError
      ? { error: { message: stringify(part.result) } }
      : {}),
  };
}

export function projectAssistantUiExecutions(
  messages: readonly ThreadMessage[],
): AgentExecution[] {
  return messages.flatMap((message) => {
    if (message.role !== "assistant") return [];
    return message.content
      .filter((part): part is ToolCallMessagePart => part.type === "tool-call")
      .map((part) => projectTool(part, message.id));
  });
}
