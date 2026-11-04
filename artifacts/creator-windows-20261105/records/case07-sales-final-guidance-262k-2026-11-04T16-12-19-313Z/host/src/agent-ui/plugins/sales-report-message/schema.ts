export const SALES_REPORT_EVENT = "app.sales.report";

export interface SalesReportRow {
  id: string;
  month: string;
  revenue: number | null;
  orderCount: number | null;
}

export interface SalesReport {
  title: string | null;
  rows: SalesReportRow[];
}

export type SalesReportParseResult =
  | { ok: true; report: SalesReport }
  | { ok: false; reason: "invalid" };

function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

/**
 * The report travels as a CUSTOM event value such as
 * { format: "json", payload: "{\"title\":...,\"rows\":[...]}" }.
 * Unwrap the JSON envelope strings until an object is reached.
 */
function unwrapEnvelope(value: unknown, depth: number): unknown {
  if (depth > 5) return value;
  if (typeof value === "string") return unwrapEnvelope(parseJsonText(value), depth + 1);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.rows)) return record;
  if ("payload" in record) return unwrapEnvelope(record.payload, depth + 1);
  if ("value" in record) return unwrapEnvelope(record.value, depth + 1);
  return record;
}

function toNumber(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input === "string") {
    const normalized = input.replace(/[,\s]/g, "");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeRow(input: unknown, index: number): SalesReportRow | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;

  const monthValue = record.month;
  const month =
    typeof monthValue === "string"
      ? monthValue.trim()
      : typeof monthValue === "number"
        ? String(monthValue)
        : "";
  if (!month) return null;

  return {
    id: `${month}-${index}`,
    month,
    revenue: toNumber(record.revenue),
    orderCount: toNumber(record.order_count ?? record.orderCount),
  };
}

export function parseSalesReport(data: unknown): SalesReportParseResult {
  const root = unwrapEnvelope(data, 0);
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    return { ok: false, reason: "invalid" };
  }

  const record = root as Record<string, unknown>;
  if (!Array.isArray(record.rows)) return { ok: false, reason: "invalid" };

  const rows = record.rows
    .map((row, index) => normalizeRow(row, index))
    .filter((row): row is SalesReportRow => row !== null);
  if (rows.length === 0) return { ok: false, reason: "invalid" };

  const titleValue = record.title;
  const title = typeof titleValue === "string" && titleValue.trim() ? titleValue.trim() : null;

  return { ok: true, report: { title, rows } };
}
