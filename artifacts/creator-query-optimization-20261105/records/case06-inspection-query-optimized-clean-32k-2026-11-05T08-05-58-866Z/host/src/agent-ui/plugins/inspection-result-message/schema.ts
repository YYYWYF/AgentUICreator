export const INSPECTION_RESULT_EVENT = "app.inspection.result";

export type InspectionStatusKind = "passed" | "failed" | "other";

export type InspectionCheck = {
  name: string;
  status: string;
  statusKind: InspectionStatusKind;
  detail: unknown;
};

export type InspectionResultData = {
  target: string | null;
  checks: InspectionCheck[];
  passedCount: number;
  failedCount: number;
  otherCount: number;
};

export type ParsedInspectionResult =
  | { success: true; data: InspectionResultData }
  | { success: false };

const FAILED_STATUSES = new Set(["failed", "fail", "failure", "error", "broken", "unhealthy"]);
const PASSED_STATUSES = new Set(["passed", "pass", "ok", "success", "succeeded", "healthy"]);
const PRIMARY_DETAIL_KEYS = new Set(["code", "message", "duration_ms"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function classifyStatus(status: string): InspectionStatusKind {
  const normalized = status.trim().toLowerCase();
  if (FAILED_STATUSES.has(normalized)) return "failed";
  if (PASSED_STATUSES.has(normalized)) return "passed";
  return "other";
}

export function parseInspectionResult(value: unknown): ParsedInspectionResult {
  if (!isRecord(value) || !Array.isArray(value.checks)) {
    return { success: false };
  }

  const checks: InspectionCheck[] = [];
  for (const entry of value.checks) {
    if (!isRecord(entry)) continue;
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!name) continue;
    const status = typeof entry.status === "string" ? entry.status.trim() : "";
    checks.push({
      name,
      status,
      statusKind: classifyStatus(status),
      detail: entry.detail ?? null,
    });
  }

  const target = typeof value.target === "string" && value.target.trim() ? value.target.trim() : null;
  let passedCount = 0;
  let failedCount = 0;
  let otherCount = 0;
  for (const check of checks) {
    if (check.statusKind === "passed") passedCount += 1;
    else if (check.statusKind === "failed") failedCount += 1;
    else otherCount += 1;
  }

  return {
    success: true,
    data: { target, checks, passedCount, failedCount, otherCount },
  };
}

export type DetailFields = {
  code: string | null;
  message: string | null;
  durationMs: number | null;
  extra: Array<{ key: string; value: string }>;
};

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

export function readDetailFields(detail: unknown): DetailFields {
  const empty: DetailFields = { code: null, message: null, durationMs: null, extra: [] };
  if (detail === null || detail === undefined) return empty;
  if (typeof detail === "string") return { ...empty, message: detail.trim() || null };
  if (typeof detail === "number" || typeof detail === "boolean") {
    return { ...empty, message: String(detail) };
  }
  if (!isRecord(detail)) return empty;

  const code = typeof detail.code === "string" && detail.code.trim() ? detail.code.trim() : null;
  const message = typeof detail.message === "string" && detail.message.trim() ? detail.message.trim() : null;
  const durationRaw = detail.duration_ms;
  const durationMs = typeof durationRaw === "number" && Number.isFinite(durationRaw) ? durationRaw : null;

  const extra: Array<{ key: string; value: string }> = [];
  for (const [key, raw] of Object.entries(detail)) {
    if (PRIMARY_DETAIL_KEYS.has(key)) continue;
    if (raw === null || raw === undefined) continue;
    extra.push({ key, value: stringifyValue(raw) });
  }

  return { code, message, durationMs, extra };
}

export function serializeCheckForCopy(check: InspectionCheck): string {
  const payload: Record<string, unknown> = { name: check.name, status: check.status };
  if (check.detail !== null && check.detail !== undefined) {
    payload.detail = check.detail;
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return `${check.name}: ${check.status}`;
  }
}
