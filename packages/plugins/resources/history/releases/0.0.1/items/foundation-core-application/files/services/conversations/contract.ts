import { z } from "zod";

export interface ConversationSummary {
  id: string;
  title: string;
  group?: string | undefined;
  updatedAt?: string | undefined;
  disabled?: boolean | undefined;
}

export interface LangGraphStateSnapshotDto {
  values: {
    messages?: unknown[] | undefined;
    [key: string]: unknown;
  };
  next?: unknown;
  metadata?: unknown;
  createdAt?: string | undefined;
  tasks?: unknown[] | undefined;
}

export interface ConversationDetailResponse {
  id: string;
  title: string;
  state: LangGraphStateSnapshotDto;
  /** Explicit AG-UI application state; never inferred from state.values. */
  agentState?: unknown;
}

export interface ConversationDetail {
  id: string;
  title: string;
  history: {
    format: "langchain";
    messages: readonly unknown[];
  };
  agentState?: unknown;
}

export interface ConversationListResponse {
  conversations: ConversationSummary[];
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

export const langGraphStateSnapshotSchema: z.ZodType<LangGraphStateSnapshotDto> =
  z.object({
    values: z.object({
      messages: z.array(z.unknown()).optional(),
    }).catchall(z.unknown()),
    next: z.unknown().optional(),
    metadata: z.unknown().optional(),
    createdAt: z.string().optional(),
    tasks: z.array(z.unknown()).optional(),
  });

export const conversationListResponseSchema: z.ZodType<ConversationListResponse> =
  z.strictObject({
    conversations: z.array(conversationSummarySchema),
  });

export const conversationDetailResponseSchema: z.ZodType<ConversationDetailResponse> =
  z.object({
    id: nonBlankStringSchema,
    title: nonBlankStringSchema,
    state: langGraphStateSnapshotSchema,
    agentState: z.unknown().optional(),
  });
