import { z } from "zod";

/** Name of the Agent `CUSTOM` event that carries the report envelope. */
export const SALES_REPORT_EVENT_NAME = "app.sales.report";

/**
 * The Agent sends `{ format: "json", payload: "<json string>" }` as the event
 * value. The runtime uses this schema only to recognize the event name as an app
 * event; the renderer performs the strict decoding itself so an unexpected but
 * real payload still reaches the message instead of being dropped silently.
 */
export const salesReportEventSchema = z.unknown();

export type SalesReportRow = {
  month: string;
  revenue: number;
  orderCount: number;
};

export type SalesReportData = {
  title?: string;
  rows: SalesReportRow[];
};

function parseJsonText(value: string): unknown {
  const text = value.trim();
  if (text === "") {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Unwraps the shapes the report can arrive in: the `{format, payload}` envelope,
 * an already decoded `{title, rows}` object, or the raw JSON text.
 */
function unwrapReportSource(input: unknown, depth = 0): unknown {
  if (depth > 4) {
    return undefined;
  }
  if (typeof input === "string") {
    return parseJsonText(input);
  }
  if (!isRecord(input)) {
    return undefined;
  }
  if ("payload" in input) {
    const payload = input.payload;
    if (typeof payload === "string") {
      return parseJsonText(payload);
    }
    if (isRecord(payload) || Array.isArray(payload)) {
      return payload;
    }
    return undefined;
  }
  if ("rows" in input) {
    return input;
  }
  if ("value" in input) {
    return unwrapReportSource(input.value, depth + 1);
  }
  if ("data" in input) {
    return unwrapReportSource(input.data, depth + 1);
  }
  return undefined;
}

function normalizeRow(input: unknown): SalesReportRow | null {
  if (!isRecord(input)) {
    return null;
  }
  const month = typeof input.month === "string" ? input.month.trim() : "";
  if (month === "") {
    return null;
  }
  const revenue = toFiniteNumber(input.revenue);
  const orderCount = toFiniteNumber(input.order_count ?? input.orderCount);
  if (revenue === null || orderCount === null) {
    return null;
  }
  return { month, revenue, orderCount };
}

/** Returns the decoded report, or `null` when the payload is not a usable report. */
export function parseSalesReport(input: unknown): SalesReportData | null {
  const candidate = unwrapReportSource(input);
  if (!isRecord(candidate) || !Array.isArray(candidate.rows)) {
    return null;
  }

  const rows: SalesReportRow[] = [];
  for (const item of candidate.rows) {
    const row = normalizeRow(item);
    if (row) {
      rows.push(row);
    }
  }
  if (rows.length === 0 && candidate.rows.length > 0) {
    return null;
  }

  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  return { title: title === "" ? undefined : title, rows };
}
