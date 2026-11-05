import { Fragment, useMemo, useState } from "react";
import type { DataMessageUIRenderProps } from "@za38.03/agent-ui-plugins";
import { useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import "./styles.css";

type Messages = {
  defaultTitle: string;
  month: string;
  revenue: string;
  orderCount: string;
  hint: string;
  invalid: string;
  missingValue: string;
  empty: string;
};

const dictionaries: Record<string, Messages> = {
  "zh-CN": {
    defaultTitle: "销售报表",
    month: "月份",
    revenue: "收入",
    orderCount: "订单数量",
    hint: "点击收入排序，点击行查看当月订单数量",
    invalid: "无法解析这份报表数据",
    missingValue: "—",
    empty: "暂无销售数据",
  },
  "en-US": {
    defaultTitle: "Sales report",
    month: "Month",
    revenue: "Revenue",
    orderCount: "Orders",
    hint: "Sort by revenue, then select a row to see that month's order count",
    invalid: "This report payload could not be parsed",
    missingValue: "—",
    empty: "No sales data available",
  },
};

type SalesRow = {
  month: string;
  revenue: number | null;
  orderCount: number | null;
};

type SalesReport = {
  title?: string;
  rows: SalesRow[];
};

type SortDirection = "desc" | "asc";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJsonCandidate(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeRows(value: unknown): SalesRow[] {
  if (!Array.isArray(value)) return [];
  const rows: SalesRow[] = [];
  for (const candidate of value) {
    const record = asRecord(candidate);
    if (!record) continue;
    const rawMonth = record.month;
    const month = typeof rawMonth === "string" ? rawMonth.trim() : "";
    if (month === "") continue;
    rows.push({
      month,
      revenue: toNumber(record.revenue),
      orderCount: toNumber(record.order_count ?? record.orderCount),
    });
  }
  return rows;
}

function parseReport(data: unknown): SalesReport | null {
  const envelope = asRecord(data);
  const payload = envelope && "payload" in envelope ? envelope.payload : data;
  const parsed = asRecord(parseJsonCandidate(payload));
  if (!parsed) return null;
  if (!Array.isArray(parsed.rows)) return null;
  const rows = normalizeRows(parsed.rows);
  const rawTitle = parsed.title;
  const title = typeof rawTitle === "string" && rawTitle.trim() !== "" ? rawTitle.trim() : undefined;
  return { title, rows };
}

function formatNumber(value: number, localeCode: string): string {
  try {
    return new Intl.NumberFormat(localeCode, { maximumFractionDigits: 2 }).format(value);
  } catch {
    return String(value);
  }
}

function formatMetric(value: number | null, localeCode: string, missingValue: string): string {
  return value === null ? missingValue : formatNumber(value, localeCode);
}

export function SalesReportMessagePlugin({ data }: DataMessageUIRenderProps<unknown>) {
  const localeCode = useAgentUILocaleCode();
  const messages = dictionaries[localeCode] ?? dictionaries["zh-CN"]!;
  const report = useMemo(() => parseReport(data), [data]);
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const sortedRows = useMemo(() => {
    const rows = report
      ? report.rows.map((row, index) => ({ row, index }))
      : ([] as { row: SalesRow; index: number }[]);
    rows.sort((left, right) => {
      const leftRevenue = left.row.revenue;
      const rightRevenue = right.row.revenue;
      if (leftRevenue === null && rightRevenue === null) return left.index - right.index;
      if (leftRevenue === null) return 1;
      if (rightRevenue === null) return -1;
      return direction === "desc" ? rightRevenue - leftRevenue : leftRevenue - rightRevenue;
    });
    return rows.map((entry) => entry.row);
  }, [report, direction]);

  if (!report) {
    return (
      <div className="sales-report sales-report--invalid" role="status">
        {messages.invalid}
      </div>
    );
  }

  const title = report.title ?? messages.defaultTitle;
  const hasRows = sortedRows.length > 0;

  return (
    <section className="sales-report" aria-label={title}>
      <header className="sales-report__header">
        <h3 className="sales-report__title">{title}</h3>
        {hasRows ? <p className="sales-report__hint">{messages.hint}</p> : null}
      </header>
      {hasRows ? (
        <div className="sales-report__scroll">
          <table className="sales-report__table">
            <thead>
              <tr>
                <th scope="col" className="sales-report__cell">
                  {messages.month}
                </th>
                <th
                  scope="col"
                  className="sales-report__cell sales-report__cell--number"
                  aria-sort={direction === "desc" ? "descending" : "ascending"}
                >
                  <button
                    type="button"
                    className="sales-report__sort"
                    onClick={() => setDirection((current) => (current === "desc" ? "asc" : "desc"))}
                  >
                    <span>{messages.revenue}</span>
                    <span aria-hidden="true" className="sales-report__sort-icon">
                      {direction === "desc" ? "\u2193" : "\u2191"}
                    </span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const expanded = expandedMonth === row.month;
                const toggle = () => setExpandedMonth(expanded ? null : row.month);
                return (
                  <Fragment key={row.month}>
                    <tr
                      className={
                        expanded
                          ? "sales-report__row sales-report__row--expanded"
                          : "sales-report__row"
                      }
                      tabIndex={0}
                      aria-expanded={expanded}
                      onClick={toggle}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggle();
                        }
                      }}
                    >
                      <td className="sales-report__cell">{row.month}</td>
                      <td className="sales-report__cell sales-report__cell--number">
                        {formatMetric(row.revenue, localeCode, messages.missingValue)}
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="sales-report__detail">
                        <td className="sales-report__cell" colSpan={2}>
                          <span className="sales-report__detail-label">{messages.orderCount}</span>
                          <span className="sales-report__detail-value">
                            {formatMetric(row.orderCount, localeCode, messages.missingValue)}
                          </span>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="sales-report__empty" role="status">
          {messages.empty}
        </p>
      )}
    </section>
  );
}
