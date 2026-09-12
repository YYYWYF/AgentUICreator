import type { AgentMessage } from "../../framework/contracts/ui-plugin";

import type {
  MessageAttachmentKind,
  MessageAttachmentRenderItem,
  MessageSourceRenderItem,
} from "./MessageRenderContext";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function safeHref(
  value: string | undefined,
  allowedProtocols: readonly string[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    return allowedProtocols.includes(parsed.protocol) ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

export function projectMessageAttachments(
  message: AgentMessage,
): MessageAttachmentRenderItem[] {
  if (message.role !== "user" || !Array.isArray(message.content)) {
    return [];
  }

  return message.content.flatMap((part, index) => {
    if (part.type === "text") {
      return [];
    }

    const partRecord = asRecord(part);
    const metadata = asRecord(partRecord?.metadata);
    const source = asRecord(partRecord?.source);
    const name =
      typeof metadata?.filename === "string"
        ? metadata.filename
        : typeof partRecord?.filename === "string"
          ? partRecord.filename
          : `${part.type}-${index + 1}`;
    const kind: MessageAttachmentKind =
      part.type === "image"
        ? "image"
        : part.type === "audio"
          ? "audio"
          : part.type === "video"
            ? "video"
            : "file";

    const rawHref =
      source?.type === "url" && typeof source.value === "string"
        ? source.value
        : typeof partRecord?.url === "string"
          ? partRecord.url
          : undefined;
    const href = safeHref(rawHref, ["http:", "https:", "blob:"]);

    return [{
      key: `${message.id}-${index}`,
      name,
      kind,
      ...(href === undefined ? {} : { href }),
    }];
  });
}

export function projectMessageSources(
  message: AgentMessage,
): MessageSourceRenderItem[] {
  const agentUI = asRecord(message.metadata?.agentUI);
  const value = message.metadata?.sources ?? agentUI?.sources;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    const record = asRecord(item);
    const title = record?.title;
    if (
      record === undefined ||
      typeof title !== "string" ||
      title.trim().length === 0
    ) {
      return [];
    }
    const href = safeHref(
      typeof record.url === "string" ? record.url : undefined,
      ["http:", "https:"],
    );
    return [{
      key: typeof record.key === "string" ? record.key : `source-${index}`,
      title,
      ...(href === undefined ? {} : { href }),
      ...(typeof record.description === "string"
        ? { description: record.description }
        : {}),
    }];
  });
}
