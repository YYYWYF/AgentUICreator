import { Fragment, useState } from "react";
import {
  defineDataMessageUI,
  useAgentUILocaleCode,
  type DataMessageUIRenderProps,
} from "@za38.03/agent-ui-plugins";
import { getSalesReportMessages } from "./i18n";
import {
  SALES_REPORT_EVENT,
  parseSalesReport,
  sortRowsByRevenue,
  type RevenueSortDirection,
} from "./schema";
import "./styles.css";

function formatAmount(value: number, localeCode: string): string {
  try {
    return new Intl.NumberFormat(localeCode).format(value);
  } catch {
    return String(value);
  }
}

export function SalesReportMessage({ data }: DataMessageUIRenderProps<unknown>) {
  const localeCode = useAgentUILocaleCode();
  const labels = getSalesReportMessages(localeCode);
  const [direction, setDirection] = useState<RevenueSortDirection>("desc");
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const parsed = parseSalesReport(data);

  if (!parsed.success) {
    return (
      <p className="sales-report__error" role="alert">
        {labels.invalid}
      </p>
    );
  }

  const { report } = parsed;
  const rows = sortRowsByRevenue(report.rows, direction);
  const nextDirection: RevenueSortDirection = direction === "asc" ? "desc" : "asc";

  return (
    <div className="sales-report" role="group" aria-label={report.title ?? labels.heading}>
      <h3 className="sales-report__title">{report.title ?? labels.heading}</h3>
      <div className="sales-report__scroll">
        <table className="sales-report__table">
          <thead>
            <tr>
              <th scope="col" className="sales-report__head">
                {labels.month}
              </th>
              <th
                scope="col"
                className="sales-report__head sales-report__head--numeric"
                aria-sort={direction === "asc" ? "ascending" : "descending"}
              >
                <button
                  type="button"
                  className="sales-report__sort"
                  onClick={() => setDirection(nextDirection)}
                  aria-label={
                    nextDirection === "asc" ? labels.sortAscending : labels.sortDescending
                  }
                >
                  <span>{labels.revenue}</span>
                  <span className="sales-report__sort-icon" aria-hidden="true">
                    {direction === "asc" ? "↑" : "↓"}
                  </span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expanded = expandedMonth === row.month;
              const detailId = `sales-report-${row.month.replace(/[^a-zA-Z0-9_-]/g, "-")}-orders`;

              return (
                <Fragment key={row.month}>
                  <tr
                    className="sales-report__row"
                    data-expanded={expanded ? "true" : undefined}
                    onClick={() => setExpandedMonth(expanded ? null : row.month)}
                  >
                    <td className="sales-report__cell">
                      <button
                        type="button"
                        className="sales-report__row-toggle"
                        aria-expanded={expanded}
                        aria-controls={detailId}
                        aria-label={expanded ? labels.collapse(row.month) : labels.expand(row.month)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedMonth(expanded ? null : row.month);
                        }}
                      >
                        {row.month}
                      </button>
                    </td>
                    <td className="sales-report__cell sales-report__cell--numeric">
                      {formatAmount(row.revenue, localeCode)}
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="sales-report__detail" id={detailId}>
                      <td className="sales-report__cell" colSpan={2}>
                        {labels.orders(row.order_count)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 注册到会话消息：name 必须与后端 CUSTOM 事件名一致。 */
export const salesReportMessageUI = defineDataMessageUI<unknown>({
  name: SALES_REPORT_EVENT,
  render: SalesReportMessage,
});
