import { z } from "zod";

export const INSPECTION_RESULT_EVENT = "app.inspection.result";
// definition.ts 必须以静态字面量声明同一个名称（Host 要求），此处仅作为解析入口的文档常量。

const checkSchema = z.object({
  name: z.string().trim().min(1),
  status: z.string().trim().min(1),
  detail: z.unknown().optional(),
});

const inspectionResultSchema = z.object({
  target: z.string().trim().min(1).optional(),
  checks: z.array(checkSchema),
});

export interface InspectionCheckDetail {
  code?: string;
  message?: string;
  durationMs?: number;
  raw: Record<string, unknown>;
}

export interface InspectionCheckView {
  name: string;
  status: string;
  passed: boolean;
  failed: boolean;
  detail?: InspectionCheckDetail;
}

export interface InspectionResultView {
  target?: string;
  checks: InspectionCheckView[];
}

export type InspectionParseResult =
  | { ok: true; value: InspectionResultView }
  | { ok: false };

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function normalizeDetail(detail: unknown): InspectionCheckDetail | undefined {
  if (detail === undefined || detail === null) return undefined;

  if (typeof detail === "string") {
    return detail.trim().length > 0 ? { message: detail, raw: { message: detail } } : undefined;
  }

  if (typeof detail !== "object" || Array.isArray(detail)) {
    return { raw: { detail } };
  }

  const record = detail as Record<string, unknown>;
  const duration = record.duration_ms;

  return {
    code: readString(record, "code"),
    message: readString(record, "message"),
    durationMs: typeof duration === "number" && Number.isFinite(duration) ? duration : undefined,
    raw: record,
  };
}

/**
 * Validates the raw CUSTOM event payload carried by `app.inspection.result`.
 * Unknown detail fields are preserved so the copied error report stays complete.
 */
export function parseInspectionResult(data: unknown): InspectionParseResult {
  const result = inspectionResultSchema.safeParse(data);
  if (!result.success) return { ok: false };

  return {
    ok: true,
    value: {
      target: result.data.target,
      checks: result.data.checks.map((check) => {
        const normalizedStatus = check.status.trim().toLowerCase();
        return {
          name: check.name,
          status: check.status,
          passed: normalizedStatus === "passed",
          failed: normalizedStatus === "failed",
          detail: normalizeDetail(check.detail),
        };
      }),
    },
  };
}
