import { randomUUID } from "node:crypto";

import { AIMessage } from "@langchain/core/messages";

export function createCreatorToolCallId(
  usedIds: ReadonlySet<string> = new Set(),
): string {
  let id: string;
  do {
    id = `call_${randomUUID().replaceAll("-", "")}`;
  } while (usedIds.has(id));
  return id;
}

export function ensureCreatorToolCallIds(message: AIMessage): AIMessage {
  const sourceToolCalls = message.tool_calls ?? [];
  if (sourceToolCalls.length === 0) {
    return message;
  }

  const usedIds = new Set<string>();
  let changed = false;
  const toolCalls = sourceToolCalls.map((toolCall) => {
    const providerId = toolCall.id?.trim() ?? "";
    const id =
      providerId !== "" && !usedIds.has(providerId)
        ? providerId
        : createCreatorToolCallId(usedIds);
    usedIds.add(id);
    changed ||= id !== toolCall.id;
    return id === toolCall.id ? toolCall : { ...toolCall, id };
  });

  if (!changed) {
    return message;
  }

  return new AIMessage({
    content: message.content,
    additional_kwargs: message.additional_kwargs,
    response_metadata: message.response_metadata,
    tool_calls: toolCalls,
    invalid_tool_calls: message.invalid_tool_calls ?? [],
    ...(message.id === undefined ? {} : { id: message.id }),
    ...(message.name === undefined ? {} : { name: message.name }),
    ...(message.usage_metadata === undefined
      ? {}
      : { usage_metadata: message.usage_metadata }),
  });
}
