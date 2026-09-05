import type {
  AgentRunState,
  AgentMessage,
} from "../../framework/contracts/ui-plugin";

export type InspectionStatus = "loading" | "success" | "error" | "abort";

export interface ToolCallInspection {
  id: string;
  name: string;
  argumentsText: string;
  result: Extract<AgentMessage, { role: "tool" }> | undefined;
  status: InspectionStatus;
}

export interface ActivityInspection {
  id: string;
  activityType: string;
  title: string;
  description: string;
  content: Record<string, unknown>;
  status: InspectionStatus;
}

export interface SourceInspection {
  key: string;
  title: string;
  url: string | undefined;
  description: string | undefined;
}

export interface AttachmentInspection {
  key: string;
  name: string;
  url: string | undefined;
  byte: number | undefined;
  description: string | undefined;
  cardType: "file" | "image" | "audio" | "video";
}

export function asRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

export function readableJSON(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function stateSurface(value: unknown): Record<string, unknown> {
  const state = asRecord(value) ?? {};
  return asRecord(state.agentUI) ?? state;
}

function toolStatus(
  result: Extract<AgentMessage, { role: "tool" }> | undefined,
  run: AgentRunState,
): InspectionStatus {
  if (result?.error !== undefined) {
    return "error";
  }
  if (result !== undefined) {
    return "success";
  }
  if (run.status === "running") {
    return "loading";
  }
  return run.status === "error" ? "error" : "abort";
}

export function inspectToolCalls(
  messages: AgentMessage[],
  run: AgentRunState,
): ToolCallInspection[] {
  const results = new Map(
    messages
      .filter(
        (message): message is Extract<AgentMessage, { role: "tool" }> =>
          message.role === "tool",
      )
      .map((message) => [message.toolCallId, message]),
  );

  return messages.flatMap((message) => {
    if (message.role !== "assistant") {
      return [];
    }

    return (message.toolCalls ?? []).map((toolCall) => {
      const result = results.get(toolCall.id);
      return {
        id: toolCall.id,
        name: toolCall.function.name,
        argumentsText: toolCall.function.arguments,
        result,
        status: toolStatus(result, run),
      };
    });
  });
}

function activityStatus(
  content: Record<string, unknown>,
  run: AgentRunState,
): InspectionStatus {
  const rawStatus = asString(content.status)?.toLowerCase();
  if (rawStatus === "error" || rawStatus === "failed") {
    return "error";
  }
  if (rawStatus === "abort" || rawStatus === "aborted" || rawStatus === "cancelled") {
    return "abort";
  }
  if (
    rawStatus === "loading" ||
    rawStatus === "running" ||
    rawStatus === "pending" ||
    rawStatus === "in_progress"
  ) {
    return "loading";
  }

  const progress = content.progress;
  if (
    run.status === "running" &&
    typeof progress === "number" &&
    progress < 100
  ) {
    return "loading";
  }
  return "success";
}

export function inspectActivities(
  messages: AgentMessage[],
  run: AgentRunState,
): ActivityInspection[] {
  return messages.flatMap((message) => {
    if (message.role !== "activity") {
      return [];
    }

    return [
      {
        id: message.id,
        activityType: message.activityType,
        title: asString(message.content.title) ?? message.activityType,
        description:
          asString(message.content.description) ?? "AG-UI activity",
        content: message.content,
        status: activityStatus(message.content, run),
      },
    ];
  });
}

export function inspectReasoning(messages: AgentMessage[]): string[] {
  return messages.flatMap((message) =>
    message.role === "reasoning" && message.content.trim().length > 0
      ? [message.content.trim()]
      : [],
  );
}

function readSourceList(value: unknown, prefix: string): SourceInspection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    const record = asRecord(item);
    const title = asString(record?.title);
    if (title === undefined) {
      return [];
    }
    return [
      {
        key: asString(record?.key) ?? `${prefix}-${index}`,
        title,
        url: asString(record?.url),
        description: asString(record?.description),
      },
    ];
  });
}

export function inspectSources(
  messages: AgentMessage[],
  state: unknown,
): SourceInspection[] {
  const messageSources = messages.flatMap((message) => {
    const agentUI = asRecord(message.metadata?.agentUI);
    return readSourceList(
      message.metadata?.sources ?? agentUI?.sources,
      `message-${message.id}-source`,
    );
  });
  const stateSources = readSourceList(
    stateSurface(state).sources,
    "state-source",
  );
  const unique = new Map<string, SourceInspection>();

  [...messageSources, ...stateSources].forEach((source) => {
    const identity = source.url ?? `${source.key}:${source.title}`;
    if (!unique.has(identity)) {
      unique.set(identity, source);
    }
  });

  return [...unique.values()];
}

function cardTypeForName(
  name: string,
): AttachmentInspection["cardType"] {
  const extension = name.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension ?? "")) {
    return "image";
  }
  if (["mp3", "wav", "m4a", "ogg"].includes(extension ?? "")) {
    return "audio";
  }
  if (["mp4", "mov", "webm"].includes(extension ?? "")) {
    return "video";
  }
  return "file";
}

function readStateAttachments(value: unknown): AttachmentInspection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    const record = asRecord(item);
    const name = asString(record?.name);
    if (name === undefined) {
      return [];
    }
    return [
      {
        key: asString(record?.key) ?? `state-attachment-${index}`,
        name,
        url: asString(record?.url),
        byte: typeof record?.byte === "number" ? record.byte : undefined,
        description: asString(record?.description),
        cardType: cardTypeForName(name),
      },
    ];
  });
}

function readMessageAttachments(message: AgentMessage): AttachmentInspection[] {
  if (message.role !== "user" || !Array.isArray(message.content)) {
    return [];
  }

  return message.content.flatMap((part, index) => {
    if (part.type === "text") {
      return [];
    }

    const record = asRecord(part);
    const metadata = asRecord(record?.metadata);
    const source = asRecord(record?.source);
    const name =
      asString(metadata?.filename) ??
      asString(record?.filename) ??
      `${part.type}-${index + 1}`;
    const sourceUrl =
      source?.type === "url" ? asString(source.value) : asString(record?.url);

    return [
      {
        key: `${message.id}-${index}`,
        name,
        url: sourceUrl,
        byte: undefined,
        description: undefined,
        cardType:
          part.type === "image" ||
          part.type === "audio" ||
          part.type === "video"
            ? part.type
            : "file",
      },
    ];
  });
}

export function inspectAttachments(
  messages: AgentMessage[],
  state: unknown,
): AttachmentInspection[] {
  const unique = new Map<string, AttachmentInspection>();
  const attachments = [
    ...messages.flatMap(readMessageAttachments),
    ...readStateAttachments(stateSurface(state).attachments),
  ];

  attachments.forEach((attachment) => {
    const identity = attachment.url ?? `${attachment.key}:${attachment.name}`;
    if (!unique.has(identity)) {
      unique.set(identity, attachment);
    }
  });

  return [...unique.values()];
}
