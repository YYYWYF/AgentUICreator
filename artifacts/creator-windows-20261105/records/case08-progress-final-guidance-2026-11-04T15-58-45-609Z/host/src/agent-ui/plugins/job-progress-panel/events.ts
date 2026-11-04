import { z } from "zod";

/** Error object carried by a failed job progress event. */
export const jobProgressErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

/**
 * Payload of the "app.job.progress" business event:
 * { job_id, title, status, completed, total, error }
 */
export const jobProgressEventSchema = z.object({
  job_id: z.union([z.string(), z.number()]).transform((value) => String(value)),
  title: z.string().optional(),
  status: z.string().optional(),
  completed: z.union([z.number(), z.string()]).optional(),
  total: z.union([z.number(), z.string()]).optional(),
  error: z.union([jobProgressErrorSchema, z.null()]).optional(),
});

export type JobProgressEventPayload = z.infer<typeof jobProgressEventSchema>;

/** Event schemas registered with the Conversation Runtime through AgentProps.appEventSchemas. */
export const jobProgressAppEventSchemas = {
  "app.job.progress": jobProgressEventSchema,
} as const;
