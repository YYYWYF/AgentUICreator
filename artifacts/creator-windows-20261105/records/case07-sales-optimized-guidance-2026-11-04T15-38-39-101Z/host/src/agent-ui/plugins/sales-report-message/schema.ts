import { z } from "zod";

export const SALES_REPORT_EVENT = "app.sales.report";

const salesReportRowSchema = z
  .object({
    month: z.string().min(1),
    revenue: z.coerce.number(),
    order_count: z.coerce.number().optional(),
    orderCount: z.coerce.number().optional(),
  })
  .transform((row) => ({
    month: row.month,
    revenue: row.revenue,
    orderCount: row.order_count ?? row.orderCount ?? 0,
  }));

const salesReportPayloadSchema = z
  .object({
    title: z.string().optional(),
    rows: z.array(salesReportRowSchema).default([]),
  })
  .transform((report) => ({
    title: report.title && report.title.trim().length > 0 ? report.title.trim() : undefined,
    rows: report.rows,
  }));

export type SalesReport = z.output<typeof salesReportPayloadSchema>;

/**
 * Event schema registered through `Agent.appEventSchemas` for the
 * `app.sales.report` CUSTOM event. The envelope stays intact so the message
 * component can read `value.format` and the JSON string in `value.payload`.
 */
export const salesReportEventSchema = z.object({
  format: z.string().optional(),
  payload: z
    .union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())])
    .optional(),
});

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export type SalesReportReadResult =
  | { status: "ok"; report: SalesReport }
  | { status: "invalid" }
  | { status: "unsupported" };

/**
 * Reads the report out of the data message payload: either the CUSTOM event
 * value (`{ format, payload }`) or an already decoded report object.
 */
export function readSalesReportState(data: unknown): SalesReportReadResult {
  const envelope = typeof data === "string" ? safeJsonParse(data) : data;

  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return { status: "invalid" };
  }

  const record = envelope as Record<string, unknown>;
  const format = typeof record.format === "string" ? record.format.trim().toLowerCase() : undefined;

  if (format && format !== "json") {
    return { status: "unsupported" };
  }

  const payload = "payload" in record ? record.payload : record;

  if (payload === undefined || payload === null) {
    return { status: "invalid" };
  }

  const decoded = typeof payload === "string" ? safeJsonParse(payload) : payload;

  if (decoded === undefined) {
    return { status: "invalid" };
  }

  const parsed = salesReportPayloadSchema.safeParse(decoded);

  return parsed.success ? { status: "ok", report: parsed.data } : { status: "invalid" };
}
