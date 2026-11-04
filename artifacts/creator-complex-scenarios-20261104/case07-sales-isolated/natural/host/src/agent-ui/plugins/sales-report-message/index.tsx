import { Fragment, useMemo, useState } from "react";
import {
  defineDataMessageUI,
  useAgentUILocaleCode,
} from "@za38.03/agent-ui-plugins";
import { parseSalesReport, SALES_REPORT_EVENT } from "./schema";
import "./styles.css";

type SortDirection = "desc" | "asc";

const messages = {
  "zh-CN": {
    heading: "月度销售报表",
    invalid: "销售报表数据格式不正确，无法显示表格。",
    monthColumn: "月份",
    revenueColumn: "收入",
    sortRevenue: "按收入排序",
    sortDescHint: "当前收入从高到低，点击改为从低到高",
    sortAscHint: "当前收入从低到高，点击改为从高到低",
    ordersLabel: "本月订单数",
    tableHint: "点击某一行可以查看该月的订单数量。",
  },
  "en-US": {
    heading: "Monthly sales report",
    invalid: "The sales report data is not valid, so the table cannot be shown.",
    monthColumn: "Month",
    revenueColumn: "Revenue",
    sortRevenue: "Sort by revenue",
    sortDescHint: "Revenue is sorted from high to low. Activate to sort from low to high.",
    sortAscHint: "Revenue is sorted from low to high. Activate to sort from high to low.",
    ordersLabel: "Orders this month",
    tableHint: "Select a row to see that month's order count.",
  },
};

type Labels = (typeof messages)[keyof typeof messages];

function resolveLabels(localeCode: string): Labels {
  return localeCode === "en-US" ? messages["en-US"] : messages["zh-CN"];
}

function resolveNumberFormat(localeCode: string): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(localeCode);
  } catch {
    return new Intl.NumberFormat();
  }
}

export function SalesReportMessage({ data }: { data: unknown }) {
  const localeCode = useAgentUILocaleCode();
  const labels = resolveLabels(localeCode);
  const parsed = useMemo(() => parseSalesReport(data), [data]);
  const [sort, setSort] = useState<SortDirection>("desc");
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const sortedRows = useMemo(() => {
    if (!parsed.ok) {
      return [];
    }
    const factor = sort === "desc" ? -1 : 1;
    return [...parsed.report.rows].sort(
      (left, right) => (left.revenue - right.revenue) * factor,
    );
  }, [parsed, sort]);

  const formatter = useMemo(() => resolveNumberFormat(localeCode), [localeCode]);

  if (!parsed.ok) {
    return (
      <p className="sales-report sales-report--invalid" role="alert">
        {labels.invalid}
      </p>
    );
  }

  const title = parsed.report.title ?? labels.heading;
  const isDesc = sort === "desc";

  return (
    <section className="sales-report" aria-label={title}>
      <div className="sales-report__scroll">
        <table className="sales-report__table">
          <caption className="sales-report__caption">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="sales-report__head">
                {labels.monthColumn}
              </th>
              <th
                scope="col"
                className="sales-report__head sales-report__head--revenue"
                aria-sort={isDesc ? "descending" : "ascending"}
              >
                <button
                  type="button"
                  className="sales-report__sort"
                  aria-label={`${labels.sortRevenue}: ${isDesc ? labels.sortDescHint : labels.sortAscHint}`}
                  onClick={() => setSort(isDesc ? "asc" : "desc")}
                >
                  <span>{labels.revenueColumn}</span>
                  <span className="sales-report__sort-icon" aria-hidden="true">
                    {isDesc ? "\u2193" : "\u2191"}
                  </span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, index) => {
              const expanded = row.month === expandedMonth;
              const detailId = `sales-report-detail-${index}`;
              const toggle = () => {
                setExpandedMonth(expanded ? null : row.month);
              };

              return (
                <Fragment key={`${row.month}-${index}`}>
                  <tr
                    className={
                      expanded
                        ? "sales-report__row sales-report__row--expanded"
                        : "sales-report__row"
                    }
                    onClick={toggle}
                  >
                    <th scope="row" className="sales-report__cell">
                      <button
                        type="button"
                        className="sales-report__row-toggle"
                        aria-expanded={expanded}
                        aria-controls={expanded ? detailId : undefined}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggle();
                        }}
                      >
                        <span className="sales-report__chevron" aria-hidden="true">
                          {expanded ? "\u25BE" : "\u25B8"}
                        </span>
                        {row.month}
                      </button>
                    </th>
                    <td className="sales-report__cell sales-report__cell--revenue">
                      {formatter.format(row.revenue)}
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="sales-report__detail" id={detailId}>
                      <td className="sales-report__detail-cell" colSpan={2}>
                        <span className="sales-report__detail-label">
                          {labels.ordersLabel}
                        </span>
                        <span className="sales-report__detail-value">
                          {formatter.format(row.orderCount)}
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
      <p className="sales-report__hint">{labels.tableHint}</p>
    </section>
  );
}

export const salesReportMessageUI = defineDataMessageUI<unknown>({
  name: SALES_REPORT_EVENT,
  render: SalesReportMessage,
});
