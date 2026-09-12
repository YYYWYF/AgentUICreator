import type { AgentMessage } from "@agent-ui/runtime-core";
import type { ThreadMessage } from "@assistant-ui/react";

function textContent(message: Extract<AgentMessage, { role: "user" }>): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((part) => part.text ?? "")
    .join("");
}

function metadataFor(
  message: AgentMessage,
  originalRole?: "developer",
): { custom: Record<string, unknown> } {
  return {
    custom: {
      ...(message.metadata ?? {}),
      ...(originalRole === undefined ? {} : { originalRole }),
    },
  };
}

function projectUserMessage(
  message: Extract<AgentMessage, { role: "user" }>,
): ThreadMessage {
  return {
    id: message.id,
    role: "user",
    content: [{ type: "text", text: textContent(message) }],
    attachments: [],
    createdAt: new Date(0),
    metadata: metadataFor(message),
  };
}

function projectAssistantMessage(
  message: Extract<AgentMessage, { role: "assistant" }>,
): ThreadMessage {
  return {
    id: message.id,
    role: "assistant",
    content: [{ type: "text", text: message.content ?? "" }],
    status: { type: "complete", reason: "unknown" },
    createdAt: new Date(0),
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      ...metadataFor(message),
    },
  };
}

function projectSystemMessage(
  message: Extract<AgentMessage, { role: "system" | "developer" }>,
): ThreadMessage {
  return {
    id: message.id,
    role: "system",
    content: [{ type: "text", text: message.content }],
    createdAt: new Date(0),
    metadata: metadataFor(
      message,
      message.role === "developer" ? "developer" : undefined,
    ),
  };
}

/** Projects the current Conversation API's text-only history contract. */
export function projectConversationHistory(
  messages: readonly AgentMessage[],
): ThreadMessage[] {
  return messages.flatMap((message): ThreadMessage[] => {
    switch (message.role) {
      case "user":
        return [projectUserMessage(message)];
      case "assistant":
        return [projectAssistantMessage(message)];
      case "system":
      case "developer":
        return [projectSystemMessage(message)];
      default:
        return [];
    }
  });
}
