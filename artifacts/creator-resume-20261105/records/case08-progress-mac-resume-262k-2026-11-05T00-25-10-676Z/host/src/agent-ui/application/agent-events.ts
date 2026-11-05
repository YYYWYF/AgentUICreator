import { z } from "zod";

/** Business job progress notification pushed by the backend as an Application Event. */
export const APP_JOB_PROGRESS_EVENT = "app.job.progress";

export const appJobProgressEventSchema = z.object({
  job_id: z.string(),
  title: z.string().optional(),
  status: z.string(),
  completed: z.number().optional(),
  total: z.number().optional(),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
    })
    .nullish(),
});

export type AppJobProgressEventPayload = z.infer<typeof appJobProgressEventSchema>;

/**
 * Application Event payload schemas registered for the Agent Runtime.
 * Keys must match the event names declared by consuming Plugins in manifest.data.events.
 */
export const appEventSchemas = {
  [APP_JOB_PROGRESS_EVENT]: appJobProgressEventSchema,
};
