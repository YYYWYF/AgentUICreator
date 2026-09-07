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
}

const nonBlankStringSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "Must not be blank");

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
    metadata: z.record(z.string(), z.unknown()).optional(),
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
  });
