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
};

const dictionaries: Record<string, Messages> = {
  "zh-CN": {
    defaultTitle: "销售报表",
    month: "月份",
    revenue: "收入",
    orderCount: "订单数量",
    hint: "点击收入排序，点击行查看当月订单数量",
    invalid: "无法解析这份报表数据",
  },
  "en-US": {
    defaultTitle: "Sales report",
    month: "Month",
    revenue: "Revenue",
    orderCount: "Orders",
    hint: "Sort by revenue, then select a row to see that month's order count",
    invalid: "This report payload could not be parsed",
  },
};

type SalesRow = {
  month: string;
  revenue: number;
  orderCount: number;
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
      revenue: toNumber(record.revenue) ?? 0,
      orderCount: toNumber(record.order_count ?? record.orderCount) ?? 0,
    });
  }
  return rows;
}

function parseReport(data: unknown): SalesReport | null {
  const envelope = asRecord(data);
  const payload = envelope && "payload" in envelope ? envelope.payload : data;
  const parsed = asRecord(parseJsonCandidate(payload));
  if (!parsed) return null;
  const rows = normalizeRows(parsed.rows);
  if (rows.length === 0) return null;
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

export function SalesReportMessagePlugin({ data }: DataMessageUIRenderProps<unknown>) {
  const localeCode = useAgentUILocaleCode();
  const messages = dictionaries[localeCode] ?? dictionaries["zh-CN"]!;
  const report = useMemo(() => parseReport(data), [data]);
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const sortedRows = useMemo(() => {
    const rows = report ? [...report.rows] : [];
    rows.sort((left, right) =>
      direction === "desc" ? right.revenue - left.revenue : left.revenue - right.revenue,
    );
    return rows;
  }, [report, direction]);

  if (!report) {
    return (
      <div className="sales-report sales-report--invalid" role="status">
        {messages.invalid}
      </div>
    );
  }

  const title = report.title ?? messages.defaultTitle;

  return (
    <section className="sales-report" aria-label={title}>
      <header className="sales-report__header">
        <h3 className="sales-report__title">{title}</h3>
        <p className="sales-report__hint">{messages.hint}</p>
      </header>
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
                      {formatNumber(row.revenue, localeCode)}
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="sales-report__detail">
                      <td className="sales-report__cell" colSpan={2}>
                        <span className="sales-report__detail-label">{messages.orderCount}</span>
                        <span className="sales-report__detail-value">
                          {formatNumber(row.orderCount, localeCode)}
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
    </section>
  );
}
