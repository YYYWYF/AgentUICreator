import { z } from "zod";

export interface ConversationSummary {
  id: string;
  title: string;
  status?: "regular" | "archived" | undefined;
  group?: string | undefined;
  updatedAt?: string | undefined;
  disabled?: boolean | undefined;
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


const nonBlankStringSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "Must not be blank");

export const conversationSummarySchema: z.ZodType<ConversationSummary> =
  z.strictObject({
    id: nonBlankStringSchema,
    title: nonBlankStringSchema,
    status: z.enum(["regular", "archived"]).optional(),
    group: nonBlankStringSchema.optional(),
    updatedAt: nonBlankStringSchema.optional(),
    disabled: z.boolean().optional(),
  });

export const conversationDetailSchema: z.ZodType<ConversationDetail> =
  z.object({
    id: nonBlankStringSchema,
    title: nonBlankStringSchema,
    history: z.object({
      format: z.literal("langchain"),
      messages: z.array(z.unknown()),
    }),
    agentState: z.unknown().optional(),
  });
