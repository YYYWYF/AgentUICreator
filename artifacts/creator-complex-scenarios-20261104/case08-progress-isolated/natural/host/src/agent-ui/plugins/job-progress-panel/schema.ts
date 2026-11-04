import { z } from "zod";

export const JOB_PROGRESS_EVENT_NAME = "app.job.progress";

export const jobProgressErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

export const jobProgressEventSchema = z.object({
  job_id: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  completed: z.number().min(0),
  total: z.number().min(0),
  error: jobProgressErrorSchema.nullish(),
});

export type JobProgressError = z.infer<typeof jobProgressErrorSchema>;
export type JobProgressEvent = z.infer<typeof jobProgressEventSchema>;

export type JobPhase = "running" | "completed" | "failed";

export type JobProgressEntry = {
  job_id: string;
  title: string;
  completed: number;
  total: number;
  error: JobProgressError | null;
  phase: JobPhase;
};

const FAILED_STATUS = /fail|error|abort|cancel/;
const COMPLETED_STATUS = /complet|done|success|succeed|finish/;

export function resolveJobPhase(event: JobProgressEvent): JobPhase {
  const status = event.status.trim().toLowerCase();
  if (event.error || FAILED_STATUS.test(status)) return "failed";
  if (COMPLETED_STATUS.test(status)) return "completed";
  if (event.total > 0 && event.completed >= event.total) return "completed";
  return "running";
}

export function toJobProgressEntry(event: JobProgressEvent): JobProgressEntry {
  return {
    job_id: event.job_id,
    title: event.title,
    completed: event.completed,
    total: event.total,
    error: event.error ?? null,
    phase: resolveJobPhase(event),
  };
}

export function parseJobProgress(payload: unknown): JobProgressEntry | null {
  const parsed = jobProgressEventSchema.safeParse(payload);
  if (!parsed.success) return null;
  return toJobProgressEntry(parsed.data);
}

export const appEventSchemas = {
  [JOB_PROGRESS_EVENT_NAME]: jobProgressEventSchema,
};
