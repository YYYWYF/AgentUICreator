import type { AgentMessage } from "@agent-ui/runtime-core";
import type { ConversationMessage } from "@agent-ui/runtime-conversation";

import type {
  ConversationDetail,
  ConversationReplay,
  ConversationReplayAssistantMessageDto,
  ConversationReplayAssistantPartDto,
  ConversationReplayAssistantStatusDto,
  ConversationReplayAttachmentDto,
  ConversationReplayDeveloperMessageDto,
  ConversationReplayMessageDto,
  ConversationReplaySystemMessageDto,
  ConversationReplayUserMessageDto,
} from "../../../services/conversations";

function textContent(message: Extract<AgentMessage, { role: "user" }>): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((part) => part.text ?? "")
    .join("");
}

function metadataFor(
  metadata: Record<string, unknown> | undefined,
  originalRole?: "developer",
): { custom: Record<string, unknown> } {
  return {
    custom: {
      ...(metadata ?? {}),
      ...(originalRole === undefined ? {} : { originalRole }),
    },
  };
}

function createdAtFor(createdAt: string | undefined): Date {
  return createdAt === undefined ? new Date(0) : new Date(createdAt);
}

function projectUserMessage(
  message: Extract<AgentMessage, { role: "user" }>,
): ConversationMessage {
  return {
    id: message.id,
    role: "user",
    content: [{ type: "text", text: textContent(message) }],
    attachments: [],
    createdAt: new Date(0),
    metadata: metadataFor(message.metadata),
  };
}

function projectAssistantMessage(
  message: Extract<AgentMessage, { role: "assistant" }>,
): ConversationMessage {
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
      ...metadataFor(message.metadata),
    },
  };
}

function projectSystemMessage(
  message: Extract<AgentMessage, { role: "system" | "developer" }>,
): ConversationMessage {
  return {
    id: message.id,
    role: "system",
    content: [{ type: "text", text: message.content }],
    createdAt: new Date(0),
    metadata: metadataFor(
      message.metadata,
      message.role === "developer" ? "developer" : undefined,
    ),
  };
}

/** Projects the current Conversation API's text-only history contract. */
export function projectConversationHistory(
  messages: readonly AgentMessage[],
): ConversationMessage[] {
  return messages.flatMap((message): ConversationMessage[] => {
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

function projectAttachment(
  attachment: ConversationReplayAttachmentDto,
): Record<string, unknown> {
  const content: Record<string, unknown>[] = attachment.type === "image"
    ? [{
        type: "image",
        image: attachment.url,
        filename: attachment.name,
      }]
    : [{
        type: "file",
        filename: attachment.name,
        data: attachment.url,
        mimeType: attachment.contentType ?? "application/octet-stream",
        sourceType: "url",
      }];

  return {
    id: attachment.id,
    type: attachment.type,
    name: attachment.name,
    ...(attachment.contentType === undefined
      ? {}
      : { contentType: attachment.contentType }),
    status: { type: "complete" },
    content,
  };
}

function projectReplayUserMessage(
  message: ConversationReplayUserMessageDto,
): ConversationMessage {
  return {
    id: message.id,
    role: "user",
    content: message.parts.map((part): Record<string, unknown> => ({
      type: "text",
      text: part.text,
    })),
    attachments: (message.attachments ?? []).map(projectAttachment),
    createdAt: createdAtFor(message.createdAt),
    metadata: metadataFor(message.metadata),
  };
}

function projectAssistantPart(
  part: ConversationReplayAssistantPartDto,
): Record<string, unknown> {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text };
    case "reasoning":
      return {
        type: "reasoning",
        text: part.text,
        status: { type: "complete" },
      };
    case "tool-call":
      return {
        type: "tool-call",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        args: part.args,
        argsText: part.argsText ?? JSON.stringify(part.args),
        ...(part.result === undefined ? {} : { result: part.result }),
        ...(part.isError === undefined ? {} : { isError: part.isError }),
      };
    case "source":
      return part.sourceType === "url"
        ? {
            type: "source",
            sourceType: "url",
            id: part.id,
            url: part.url,
            ...(part.title === undefined ? {} : { title: part.title }),
          }
        : {
            type: "source",
            sourceType: "document",
            id: part.id,
            title: part.title,
            mediaType: part.mediaType,
            ...(part.filename === undefined ? {} : { filename: part.filename }),
          };
  }
}

function projectAssistantStatus(
  status: ConversationReplayAssistantStatusDto | undefined,
): Record<string, unknown> {
  if (status?.type === "incomplete") {
    return {
      type: "incomplete",
      reason: status.reason,
      ...(status.error === undefined ? {} : { error: status.error }),
    };
  }
  return {
    type: "complete",
    reason: status?.reason ?? "unknown",
  };
}

function projectReplayAssistantMessage(
  message: ConversationReplayAssistantMessageDto,
): ConversationMessage {
  return {
    id: message.id,
    role: "assistant",
    content: message.parts.map(projectAssistantPart),
    status: projectAssistantStatus(message.status),
    createdAt: createdAtFor(message.createdAt),
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      ...metadataFor(message.metadata),
    },
  };
}

function replaySystemText(
  message: ConversationReplaySystemMessageDto | ConversationReplayDeveloperMessageDto,
): string {
  return message.parts.map((part) => part.text).join("\n");
}

function projectReplaySystemMessage(
  message: ConversationReplaySystemMessageDto | ConversationReplayDeveloperMessageDto,
): ConversationMessage {
  const text = replaySystemText(message);
  return {
    id: message.id,
    role: "system",
    content: [{ type: "text", text }],
    createdAt: createdAtFor(message.createdAt),
    metadata: metadataFor(
      message.metadata,
      message.role === "developer" ? "developer" : undefined,
    ),
  };
}

function projectReplayMessage(message: ConversationReplayMessageDto): ConversationMessage {
  switch (message.role) {
    case "user":
      return projectReplayUserMessage(message);
    case "assistant":
      return projectReplayAssistantMessage(message);
    case "system":
    case "developer":
      return projectReplaySystemMessage(message);
  }
}

export function projectConversationReplay(
  replay: ConversationReplay,
): ConversationMessage[] {
  return replay.messages.map(projectReplayMessage);
}

export function projectConversationDetail(
  detail: Pick<ConversationDetail, "messages" | "replay">,
): ConversationMessage[] {
  return detail.replay === undefined
    ? projectConversationHistory(detail.messages)
    : projectConversationReplay(detail.replay);
}
