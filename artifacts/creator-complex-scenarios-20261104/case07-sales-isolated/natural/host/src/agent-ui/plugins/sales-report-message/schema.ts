import { z } from "zod";

/** CUSTOM 事件名，必须与后端事件名完全一致。 */
export const SALES_REPORT_EVENT = "app.sales.report";

/**
 * 事件解析配置。Runtime 会自动把 CUSTOM 事件转成消息，这里只声明事件名，
 * 具体字段校验交给 parseSalesReport，避免字段缺失时消息被整体丢弃。
 */
export const salesReportEventSchema = z.unknown();

export type SalesReportRow = {
  month: string;
  revenue: number;
  orderCount: number;
};

export type SalesReport = {
  title?: string;
  rows: SalesReportRow[];
};

export type SalesReportParseResult =
  | { ok: true; report: SalesReport }
  | { ok: false };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** 兼容 payload 为 JSON 字符串、字符串套字符串以及已解析对象三种形态。 */
function decodePayload(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return value;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) {
      return null;
    }
    try {
      return decodePayload(JSON.parse(text), depth + 1);
    } catch {
      return null;
    }
  }
  const record = asRecord(value);
  if (record && "payload" in record) {
    return decodePayload(record.payload, depth + 1);
  }
  return value;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const text = value.trim().replace(/[,\s]/g, "");
    if (!text) {
      return null;
    }
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseSalesReport(data: unknown): SalesReportParseResult {
  const decoded = decodePayload(data);
  const record = asRecord(decoded);
  if (!record || !Array.isArray(record.rows)) {
    return { ok: false };
  }

  const rows: SalesReportRow[] = [];
  for (const item of record.rows) {
    const row = asRecord(item);
    if (!row) {
      continue;
    }
    const month = toText(row.month);
    const revenue = toNumber(row.revenue);
    const orderCount = toNumber(row.order_count ?? row.orderCount);
    if (month === null || revenue === null || orderCount === null) {
      continue;
    }
    rows.push({ month, revenue, orderCount });
  }

  if (rows.length === 0) {
    return { ok: false };
  }

  const title = toText(record.title) ?? undefined;
  return { ok: true, report: { title, rows } };
}
