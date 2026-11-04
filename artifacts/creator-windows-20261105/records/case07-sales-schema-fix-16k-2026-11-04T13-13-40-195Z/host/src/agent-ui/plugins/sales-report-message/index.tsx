import { useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import { useMemo, useState } from "react";
import { parseSalesReport } from "./schema";
import "./styles.css";

type SalesReportMessageProps = {
  data?: unknown;
};

type SalesReportLocaleText = {
  fallbackTitle: string;
  month: string;
  revenue: string;
  sortDescending: string;
  sortAscending: string;
  empty: string;
  invalid: string;
  detailHint: string;
  detail: (month: string, orderCount: string) => string;
};

const messages: Record<string, SalesReportLocaleText> = {
  "zh-CN": {
    fallbackTitle: "销售报表",
    month: "月份",
    revenue: "收入",
    sortDescending: "收入从高到低",
    sortAscending: "收入从低到高",
    empty: "报表中没有可显示的数据行。",
    invalid: "无法解析这条报表数据，暂时无法显示表格。",
    detailHint: "点击任意一行查看该月的订单数量。",
    detail: (month, orderCount) => `${month} 的订单数量：${orderCount}`,
  },
  "en-US": {
    fallbackTitle: "Sales report",
    month: "Month",
    revenue: "Revenue",
    sortDescending: "Revenue high to low",
    sortAscending: "Revenue low to high",
    empty: "The report has no rows to display.",
    invalid: "This report data could not be parsed, so the table cannot be shown.",
    detailHint: "Select a row to see that month's order count.",
    detail: (month, orderCount) => `${month} order count: ${orderCount}`,
  },
};

type SortDirection = "desc" | "asc";

export function SalesReportMessagePlugin(props: SalesReportMessageProps) {
  const localeCode = useAgentUILocaleCode();
  const text = messages[localeCode] ?? messages["zh-CN"]!;
  const report = useMemo(() => parseSalesReport(props.data), [props.data]);
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const orderedRows = useMemo(() => {
    if (!report) {
      return [];
    }
    return report.rows
      .map((row, index) => ({ key: `${row.month}#${index}`, row }))
      .sort((left, right) =>
        direction === "desc"
          ? right.row.revenue - left.row.revenue
          : left.row.revenue - right.row.revenue,
      );
  }, [report, direction]);

  const formatNumber = (value: number) =>
    new Intl.NumberFormat(localeCode === "en-US" ? "en-US" : "zh-CN", {
      maximumFractionDigits: 0,
    }).format(value);

  if (!report) {
    return (
      <div className="sales-report sales-report--invalid" role="status">
        <p className="sales-report__invalid-text">{text.invalid}</p>
      </div>
    );
  }

  const selected = orderedRows.find((entry) => entry.key === selectedKey) ?? null;
  const sortLabel = direction === "desc" ? text.sortDescending : text.sortAscending;
  const selectRow = (key: string) => {
    setSelectedKey((current) => (current === key ? null : key));
  };

  return (
    <section className="sales-report" aria-label={report.title ?? text.fallbackTitle}>
      <h3 className="sales-report__title">{report.title ?? text.fallbackTitle}</h3>
      <div className="sales-report__table-wrap">
        <table className="sales-report__table">
          <thead>
            <tr>
              <th scope="col" className="sales-report__head-cell">
                {text.month}
              </th>
              <th
                scope="col"
                className="sales-report__head-cell sales-report__head-cell--revenue"
                aria-sort={direction === "desc" ? "descending" : "ascending"}
              >
                <button
                  type="button"
                  className="sales-report__sort"
                  aria-label={`${text.revenue}：${sortLabel}`}
                  onClick={() =>
                    setDirection((current) => (current === "desc" ? "asc" : "desc"))
                  }
                >
                  <span>{text.revenue}</span>
                  <span aria-hidden="true">{direction === "desc" ? "↓" : "↑"}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {orderedRows.length === 0 ? (
              <tr>
                <td className="sales-report__empty" colSpan={2}>
                  {text.empty}
                </td>
              </tr>
            ) : (
              orderedRows.map((entry) => {
                const isSelected = entry.key === selectedKey;
                return (
                  <tr
                    key={entry.key}
                    className="sales-report__row"
                    data-selected={isSelected ? "true" : "false"}
                    tabIndex={0}
                    aria-selected={isSelected}
                    onClick={() => selectRow(entry.key)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectRow(entry.key);
                      }
                    }}
                  >
                    <th scope="row" className="sales-report__month">
                      {entry.row.month}
                    </th>
                    <td className="sales-report__revenue">{formatNumber(entry.row.revenue)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div
        className="sales-report__detail"
        role="status"
        aria-live="polite"
        data-empty={selected ? "false" : "true"}
      >
        {selected
          ? text.detail(selected.row.month, formatNumber(selected.row.orderCount))
          : text.detailHint}
      </div>
    </section>
  );
}
