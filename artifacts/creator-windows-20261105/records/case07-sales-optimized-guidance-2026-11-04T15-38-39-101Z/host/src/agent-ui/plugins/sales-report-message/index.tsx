import { Fragment, useMemo, useState } from "react";
import {
  defineDataMessageUI,
  useAgentUILocaleCode,
} from "@za38.03/agent-ui-plugins";
import { getProjectMessages } from "../../application/i18n/messages";
import { SALES_REPORT_EVENT, readSalesReportState } from "./schema";
import "./styles.css";

export function SalesReportMessage({ data }: { data: unknown }) {
  const localeCode = useAgentUILocaleCode();
  const labels = getProjectMessages(localeCode).salesReport;
  const state = readSalesReportState(data);
  const [descending, setDescending] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (state.status !== "ok") {
      return [];
    }

    return [...state.report.rows].sort((left, right) =>
      descending ? right.revenue - left.revenue : left.revenue - right.revenue,
    );
  }, [state, descending]);

  if (state.status === "unsupported") {
    return (
      <p className="sales-report-message sales-report-message--notice" role="status">
        {labels.unsupportedFormat}
      </p>
    );
  }

  if (state.status === "invalid") {
    return (
      <p className="sales-report-message sales-report-message--notice" role="alert">
        {labels.invalid}
      </p>
    );
  }

  const title = state.report.title ?? labels.fallbackTitle;
  const numberFormat = new Intl.NumberFormat(localeCode);
  const sortLabel = descending ? labels.sortRevenueAscending : labels.sortRevenueDescending;
  const toggleMonth = (month: string) => {
    setExpandedMonth((current) => (current === month ? null : month));
  };

  return (
    <section className="sales-report-message" aria-label={title}>
      <h3 className="sales-report-message__title">{title}</h3>
      {rows.length === 0 ? (
        <p className="sales-report-message__empty">{labels.emptyRows}</p>
      ) : (
        <table className="sales-report-message__table" aria-label={title}>
          <thead>
            <tr>
              <th scope="col">{labels.month}</th>
              <th scope="col" aria-sort={descending ? "descending" : "ascending"}>
                <button
                  type="button"
                  className="sales-report-message__sort"
                  onClick={() => setDescending((current) => !current)}
                  aria-label={sortLabel}
                  title={sortLabel}
                >
                  {labels.revenue}
                  <span aria-hidden="true">{descending ? "\u2193" : "\u2191"}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const expanded = expandedMonth === row.month;

              return (
                <Fragment key={`${row.month}-${index}`}>
                  <tr
                    className="sales-report-message__row"
                    tabIndex={0}
                    aria-expanded={expanded}
                    data-expanded={expanded ? "true" : undefined}
                    onClick={() => toggleMonth(row.month)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleMonth(row.month);
                      }
                    }}
                  >
                    <th scope="row">{row.month}</th>
                    <td className="sales-report-message__revenue">
                      {numberFormat.format(row.revenue)}
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="sales-report-message__detail">
                      <td colSpan={2}>
                        <span className="sales-report-message__detail-label">
                          {labels.orderCount}
                        </span>
                        <strong className="sales-report-message__detail-value">
                          {numberFormat.format(row.orderCount)}
                        </strong>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export const salesReportMessageUI = defineDataMessageUI<unknown>({
  name: SALES_REPORT_EVENT,
  render: SalesReportMessage,
});
