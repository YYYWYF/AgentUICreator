import { z } from "zod";

/**
 * Project-owned business application events.
 *
 * Registered through `<Agent appEventSchemas={agentEventSchemas} />` and declared per
 * consumer Plugin in its manifest `data.events`. These are live notifications only:
 * they do not replay conversation history.
 */
const jobErrorSchema = z
  .object({
    code: z.string().optional(),
    message: z.string().optional(),
  })
  .loose();

export const jobProgressEventSchema = z
  .object({
    job_id: z.string().min(1),
    title: z.string().optional(),
    status: z.string().optional(),
    completed: z.number().optional(),
    total: z.number().optional(),
    error: jobErrorSchema.nullish(),
  })
  .loose();

export const agentEventSchemas = {
  "app.job.progress": jobProgressEventSchema,
};
