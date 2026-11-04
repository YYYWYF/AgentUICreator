import { z } from "zod";

/** 后端 Agent 发送的自定义事件名，必须与 data message UI 的 name 完全一致。 */
export const SALES_REPORT_EVENT = "app.sales.report";

const salesReportRowSchema = z.object({
  month: z.string().min(1),
  revenue: z.number(),
  order_count: z.number(),
});

const salesReportPayloadSchema = z.object({
  title: z.string().min(1).optional(),
  rows: z.array(salesReportRowSchema).min(1),
});

export type SalesReportRow = z.infer<typeof salesReportRowSchema>;

export type SalesReport = {
  title?: string;
  rows: SalesReportRow[];
};

export type SalesReportParseResult =
  | { success: true; report: SalesReport }
  | { success: false; reason: "invalid_json" | "invalid_shape" };

export type RevenueSortDirection = "asc" | "desc";

/**
 * 事件 value 可能是 { format, payload } 信封、payload 字符串本身，或已解析的对象，
 * 这里统一取出真正承载报表 JSON 的那一层。
 */
function resolvePayloadSource(data: unknown): unknown {
  if (typeof data === "string") {
    return data;
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const payload = record.payload;
    if (typeof payload === "string") {
      return payload;
    }
    if (payload && typeof payload === "object") {
      return payload;
    }
  }

  return data;
}

export function parseSalesReport(data: unknown): SalesReportParseResult {
  const source = resolvePayloadSource(data);

  let decoded: unknown = source;
  if (typeof source === "string") {
    try {
      decoded = JSON.parse(source) as unknown;
    } catch {
      return { success: false, reason: "invalid_json" };
    }
  }

  const parsed = salesReportPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    return { success: false, reason: "invalid_shape" };
  }

  return {
    success: true,
    report: {
      title: parsed.data.title,
      rows: parsed.data.rows,
    },
  };
}

/** 按收入排序，收入相同时按月份稳定排序。 */
export function sortRowsByRevenue(
  rows: readonly SalesReportRow[],
  direction: RevenueSortDirection,
): SalesReportRow[] {
  const factor = direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const difference = (left.revenue - right.revenue) * factor;
    if (difference !== 0) {
      return difference;
    }
    return left.month.localeCompare(right.month);
  });
}
