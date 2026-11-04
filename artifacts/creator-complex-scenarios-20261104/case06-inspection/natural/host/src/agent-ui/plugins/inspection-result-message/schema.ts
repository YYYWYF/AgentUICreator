import { z } from "zod";

/** Exact AG-UI CUSTOM event name produced by the backend inspection run. */
export const INSPECTION_RESULT_EVENT = "app.inspection.result";

export const inspectionCheckSchema = z.object({
  name: z.string().min(1),
  status: z.string().min(1),
  detail: z.unknown().optional(),
});

export const inspectionResultSchema = z.object({
  target: z.string().min(1),
  checks: z.array(inspectionCheckSchema),
});

export type InspectionCheck = z.infer<typeof inspectionCheckSchema>;
export type InspectionResult = z.infer<typeof inspectionResultSchema>;

/** Validate the event payload without inventing fields the backend may not send. */
export function parseInspectionResult(data: unknown) {
  return inspectionResultSchema.safeParse(data);
}
