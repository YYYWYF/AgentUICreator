import type { AgentMessage } from "../../framework/contracts/ui-plugin";
import { z } from "zod";

export interface ConversationSummary {
  id: string;
  title: string;
  group?: string | undefined;
  updatedAt?: string | undefined;
  disabled?: boolean | undefined;
}

export interface ConversationDetail {
  id: string;
  title: string;
  messages: AgentMessage[];
  replay?: ConversationReplay | undefined;
}

export interface ConversationHistoryMessageDto {
  id: string;
  role: "user" | "assistant" | "system" | "developer";
  content: string;
  metadata?: Record<string, unknown> | undefined;
}

export interface ConversationListResponse {
  conversations: ConversationSummary[];
}

export interface ConversationDetailResponse {
  id: string;
  title: string;
  messages: ConversationHistoryMessageDto[];
  replay?: ConversationReplayDto | undefined;
}

export type ConversationReplayJsonValue =
  | null
  | boolean
  | number
  | string
  | ConversationReplayJsonValue[]
  | ConversationReplayJsonObject;

export type ConversationReplayJsonObject = {
  [key: string]: ConversationReplayJsonValue;
};

export interface ConversationReplayTextPartDto {
  type: "text";
  text: string;
}

export type ConversationReplayUserPartDto = ConversationReplayTextPartDto;

export interface ConversationReplayReasoningPartDto {
  type: "reasoning";
  text: string;
}

export interface ConversationReplayToolCallPartDto {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: ConversationReplayJsonObject;
  argsText?: string | undefined;
  result?: ConversationReplayJsonValue | undefined;
  isError?: boolean | undefined;
}

export interface ConversationReplayUrlSourcePartDto {
  type: "source";
  sourceType: "url";
  id: string;
  url: string;
  title?: string | undefined;
}

export interface ConversationReplayDocumentSourcePartDto {
  type: "source";
  sourceType: "document";
  id: string;
  title: string;
  mediaType: string;
  filename?: string | undefined;
}

export type ConversationReplayAssistantPartDto =
  | ConversationReplayTextPartDto
  | ConversationReplayReasoningPartDto
  | ConversationReplayToolCallPartDto
  | ConversationReplayUrlSourcePartDto
  | ConversationReplayDocumentSourcePartDto;

export interface ConversationReplayAttachmentDto {
  id: string;
  type: "image" | "document" | "file";
  name: string;
  contentType?: string | undefined;
  url: string;
}

export type ConversationReplayAssistantStatusDto =
  | {
      type: "complete";
      reason?: "stop" | "unknown" | undefined;
    }
  | {
      type: "incomplete";
      reason:
        | "cancelled"
        | "length"
        | "content-filter"
        | "other"
        | "error";
      error?: ConversationReplayJsonValue | undefined;
    };

export interface ConversationReplayUserMessageDto {
  id: string;
  role: "user";
  parts: ConversationReplayUserPartDto[];
  attachments?: ConversationReplayAttachmentDto[] | undefined;
  createdAt?: string | undefined;
  metadata?: ConversationReplayJsonObject | undefined;
}

export interface ConversationReplayAssistantMessageDto {
  id: string;
  role: "assistant";
  parts: ConversationReplayAssistantPartDto[];
  status?: ConversationReplayAssistantStatusDto | undefined;
  createdAt?: string | undefined;
  metadata?: ConversationReplayJsonObject | undefined;
}

export interface ConversationReplaySystemMessageDto {
  id: string;
  role: "system";
  parts: ConversationReplayTextPartDto[];
  createdAt?: string | undefined;
  metadata?: ConversationReplayJsonObject | undefined;
}

export interface ConversationReplayDeveloperMessageDto {
  id: string;
  role: "developer";
  parts: ConversationReplayTextPartDto[];
  createdAt?: string | undefined;
  metadata?: ConversationReplayJsonObject | undefined;
}

export type ConversationReplayMessageDto =
  | ConversationReplayUserMessageDto
  | ConversationReplayAssistantMessageDto
  | ConversationReplaySystemMessageDto
  | ConversationReplayDeveloperMessageDto;

export interface ConversationReplay {
  version: 1;
  messages: ConversationReplayMessageDto[];
}

export type ConversationReplayDto = ConversationReplay;

const nonBlankStringSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "Must not be blank");

const jsonValueSchema: z.ZodType<ConversationReplayJsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const jsonMetadataSchema = z.record(z.string(), jsonValueSchema);
const createdAtSchema = z.iso.datetime({ offset: true });

const conversationReplayTextPartSchema = z.strictObject({
  type: z.literal("text"),
  text: z.string(),
});

const conversationReplayReasoningPartSchema = z.strictObject({
  type: z.literal("reasoning"),
  text: z.string(),
});

const conversationReplayToolCallPartSchema = z.strictObject({
  type: z.literal("tool-call"),
  toolCallId: nonBlankStringSchema,
  toolName: nonBlankStringSchema,
  args: z.record(z.string(), jsonValueSchema),
  argsText: z.string().optional(),
  result: jsonValueSchema.optional(),
  isError: z.boolean().optional(),
});

const conversationReplayUrlSourcePartSchema = z.strictObject({
  type: z.literal("source"),
  sourceType: z.literal("url"),
  id: nonBlankStringSchema,
  url: nonBlankStringSchema,
  title: z.string().optional(),
});

const conversationReplayDocumentSourcePartSchema = z.strictObject({
  type: z.literal("source"),
  sourceType: z.literal("document"),
  id: nonBlankStringSchema,
  title: nonBlankStringSchema,
  mediaType: nonBlankStringSchema,
  filename: nonBlankStringSchema.optional(),
});

const conversationReplayAttachmentSchema = z.strictObject({
  id: nonBlankStringSchema,
  type: z.enum(["image", "document", "file"]),
  name: nonBlankStringSchema,
  contentType: nonBlankStringSchema.optional(),
  url: nonBlankStringSchema,
});

const conversationReplayAssistantStatusSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("complete"),
    reason: z.enum(["stop", "unknown"]).optional(),
  }),
  z.strictObject({
    type: z.literal("incomplete"),
    reason: z.enum([
      "cancelled",
      "length",
      "content-filter",
      "other",
      "error",
    ]),
    error: jsonValueSchema.optional(),
  }),
]);

const conversationReplayUserMessageSchema = z.strictObject({
  id: nonBlankStringSchema,
  role: z.literal("user"),
  parts: z.array(conversationReplayTextPartSchema),
  attachments: z.array(conversationReplayAttachmentSchema).optional(),
  createdAt: createdAtSchema.optional(),
  metadata: jsonMetadataSchema.optional(),
});

const conversationReplayAssistantMessageSchema = z.strictObject({
  id: nonBlankStringSchema,
  role: z.literal("assistant"),
  parts: z.array(z.union([
    conversationReplayTextPartSchema,
    conversationReplayReasoningPartSchema,
    conversationReplayToolCallPartSchema,
    conversationReplayUrlSourcePartSchema,
    conversationReplayDocumentSourcePartSchema,
  ])),
  status: conversationReplayAssistantStatusSchema.optional(),
  createdAt: createdAtSchema.optional(),
  metadata: jsonMetadataSchema.optional(),
});

const conversationReplaySystemMessageSchema = z.strictObject({
  id: nonBlankStringSchema,
  role: z.literal("system"),
  parts: z.array(conversationReplayTextPartSchema),
  createdAt: createdAtSchema.optional(),
  metadata: jsonMetadataSchema.optional(),
});

const conversationReplayDeveloperMessageSchema = z.strictObject({
  id: nonBlankStringSchema,
  role: z.literal("developer"),
  parts: z.array(conversationReplayTextPartSchema),
  createdAt: createdAtSchema.optional(),
  metadata: jsonMetadataSchema.optional(),
});

export const conversationReplayMessageDtoSchema = z.discriminatedUnion("role", [
  conversationReplayUserMessageSchema,
  conversationReplayAssistantMessageSchema,
  conversationReplaySystemMessageSchema,
  conversationReplayDeveloperMessageSchema,
]);

export const conversationReplaySchema = z.strictObject({
  version: z.literal(1),
  messages: z.array(conversationReplayMessageDtoSchema),
});

export const conversationSummarySchema: z.ZodType<ConversationSummary> =
  z.strictObject({
    id: nonBlankStringSchema,
    title: nonBlankStringSchema,
    group: nonBlankStringSchema.optional(),
    updatedAt: nonBlankStringSchema.optional(),
    disabled: z.boolean().optional(),
  });

export const conversationHistoryMessageDtoSchema: z.ZodType<ConversationHistoryMessageDto> =
  z.strictObject({
    id: nonBlankStringSchema,
    role: z.enum(["user", "assistant", "system", "developer"]),
    content: z.string(),
    metadata: jsonMetadataSchema.optional(),
  });

export const conversationListResponseSchema: z.ZodType<ConversationListResponse> =
  z.strictObject({
    conversations: z.array(conversationSummarySchema),
  });

export const conversationDetailResponseSchema: z.ZodType<ConversationDetailResponse> =
  z.strictObject({
    id: nonBlankStringSchema,
    title: nonBlankStringSchema,
    messages: z.array(conversationHistoryMessageDtoSchema),
    replay: conversationReplaySchema.optional(),
  });
