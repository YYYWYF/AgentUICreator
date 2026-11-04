import { Fragment, useMemo, useState } from "react";
import { useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import { getProjectMessages } from "../../application/i18n/messages";
import { parseSalesReport, type SalesReportRow } from "./schema";
import "./styles.css";

type SortDirection = "desc" | "asc";

function sortRows(rows: SalesReportRow[], direction: SortDirection): SalesReportRow[] {
  const factor = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (a.revenue === null && b.revenue === null) return a.month.localeCompare(b.month);
    if (a.revenue === null) return 1;
    if (b.revenue === null) return -1;
    if (a.revenue === b.revenue) return a.month.localeCompare(b.month);
    return (a.revenue - b.revenue) * factor;
  });
}

export function SalesReportMessage({ data }: { data: unknown }) {
  const localeCode = useAgentUILocaleCode();
  const labels = getProjectMessages(localeCode).salesReport;
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const numbers = useMemo(
    () => new Intl.NumberFormat(localeCode, { maximumFractionDigits: 2 }),
    [localeCode],
  );
  const result = useMemo(() => parseSalesReport(data), [data]);

  if (!result.ok) {
    return (
      <section className="sales-report" role="alert">
        <p className="sales-report__status">{labels.invalid}</p>
      </section>
    );
  }

  const { report } = result;
  const heading = report.title ?? labels.heading;
  const rows = sortRows(report.rows, direction);

  const toggleRow = (rowId: string) => {
    setSelectedId((current) => (current === rowId ? null : rowId));
  };

  const formatValue = (value: number | null) =>
    value === null ? labels.unknown : numbers.format(value);

  return (
    <section className="sales-report" aria-label={heading}>
      <header className="sales-report__header">
        <h3 className="sales-report__title">{heading}</h3>
        <p className="sales-report__hint">{labels.hint}</p>
      </header>

      {rows.length === 0 ? (
        <p className="sales-report__status">{labels.empty}</p>
      ) : (
        <div className="sales-report__scroll">
          <table className="sales-report__table" aria-label={heading}>
            <thead>
              <tr>
                <th scope="col" className="sales-report__col-month">
                  {labels.month}
                </th>
                <th
                  scope="col"
                  className="sales-report__col-revenue"
                  aria-sort={direction === "desc" ? "descending" : "ascending"}
                >
                  <button
                    type="button"
                    className="sales-report__sort"
                    onClick={() =>
                      setDirection((current) => (current === "desc" ? "asc" : "desc"))
                    }
                  >
                    <span>{labels.revenue}</span>
                    <span className="sales-report__sort-icon" aria-hidden="true">
                      {direction === "desc" ? "↓" : "↑"}
                    </span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selected = row.id === selectedId;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className="sales-report__row"
                      data-selected={selected ? "true" : undefined}
                      tabIndex={0}
                      aria-expanded={selected}
                      onClick={() => toggleRow(row.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleRow(row.id);
                        }
                      }}
                    >
                      <th scope="row" className="sales-report__col-month">
                        {row.month}
                      </th>
                      <td className="sales-report__col-revenue">
                        {formatValue(row.revenue)}
                      </td>
                    </tr>
                    {selected ? (
                      <tr className="sales-report__detail">
                        <td colSpan={2}>
                          <span className="sales-report__detail-inner" role="status">
                            <span className="sales-report__detail-month">{row.month}</span>
                            <span className="sales-report__detail-label">
                              {labels.orderCount}
                            </span>
                            <span className="sales-report__detail-value">
                              {formatValue(row.orderCount)}
                            </span>
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
      )}
    </section>
  );
}

export default SalesReportMessage;
