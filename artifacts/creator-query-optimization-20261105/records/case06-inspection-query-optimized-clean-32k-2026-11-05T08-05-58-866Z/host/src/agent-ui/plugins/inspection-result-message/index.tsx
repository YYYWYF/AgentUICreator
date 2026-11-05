import { defineDataMessageUI, useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { getInspectionCopy, type InspectionCopy } from "./messages";
import {
  INSPECTION_RESULT_EVENT,
  parseInspectionResult,
  readDetailFields,
  serializeCheckForCopy,
  type DetailFields,
  type InspectionCheck,
} from "./schema";
import "./styles.css";

type CopyFeedback = "copied" | "error";

async function writeClipboard(text: string): Promise<boolean> {
  try {
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard?.writeText) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function buildDetailRows(
  fields: DetailFields,
  copy: InspectionCopy,
): Array<{ key: string; label: string; value: ReactNode }> {
  const rows: Array<{ key: string; label: string; value: ReactNode }> = [];
  if (fields.code) {
    rows.push({ key: "code", label: copy.codeLabel, value: <code>{fields.code}</code> });
  }
  if (fields.message) {
    rows.push({ key: "message", label: copy.messageLabel, value: fields.message });
  }
  if (fields.durationMs !== null) {
    rows.push({ key: "duration", label: copy.durationLabel, value: copy.durationValue(fields.durationMs) });
  }
  for (const extra of fields.extra) {
    rows.push({ key: `extra-${extra.key}`, label: extra.key, value: extra.value });
  }
  return rows;
}

export function InspectionResultMessage({ data }: { data: unknown }) {
  const copy = getInspectionCopy(useAgentUILocaleCode());
  const parsed = parseInspectionResult(data);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [feedbacks, setFeedbacks] = useState<Record<string, CopyFeedback>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of Object.values(pending)) clearTimeout(timer);
    };
  }, []);

  const toggle = useCallback((key: string) => {
    setExpandedKeys((previous) => ({ ...previous, [key]: !previous[key] }));
  }, []);

  const handleCopy = useCallback(async (key: string, check: InspectionCheck) => {
    const succeeded = await writeClipboard(serializeCheckForCopy(check));
    setFeedbacks((previous) => ({ ...previous, [key]: succeeded ? "copied" : "error" }));
    const existing = timers.current[key];
    if (existing) clearTimeout(existing);
    timers.current[key] = setTimeout(() => {
      setFeedbacks((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
      delete timers.current[key];
    }, 2000);
  }, []);

  if (!parsed.success) {
    return (
      <section className="inspection-result inspection-result--invalid" role="alert">
        <p className="inspection-result__message">{copy.invalid}</p>
      </section>
    );
  }

  const { target, checks, passedCount, failedCount, otherCount } = parsed.data;
  const failed: Array<{ key: string; check: InspectionCheck }> = [];
  const passed: Array<{ key: string; check: InspectionCheck }> = [];
  const other: Array<{ key: string; check: InspectionCheck }> = [];
  checks.forEach((check, index) => {
    const entry = { key: `check-${index}`, check };
    if (check.statusKind === "failed") failed.push(entry);
    else if (check.statusKind === "passed") passed.push(entry);
    else other.push(entry);
  });

  return (
    <section className="inspection-result" aria-label={copy.cardLabel(target)}>
      <header className="inspection-result__header">
        <h3 className="inspection-result__title">{target ?? copy.title}</h3>
        <p className="inspection-result__summary" data-tone={failedCount > 0 ? "failed" : "passed"}>
          {copy.summary({ passed: passedCount, failed: failedCount, other: otherCount })}
        </p>
      </header>

      {failed.length > 0 ? (
        <section className="inspection-result__group" data-tone="failed" aria-label={copy.failedHeading}>
          <h4 className="inspection-result__group-title">{copy.failedHeading}</h4>
          <ul className="inspection-result__list">
            {failed.map(({ key, check }) => {
              const detailId = `inspection-result-detail-${key}`;
              const isExpanded = Boolean(expandedKeys[key]);
              const fields = readDetailFields(check.detail);
              const rows = buildDetailRows(fields, copy);
              const feedback = feedbacks[key];
              return (
                <li key={key} className="inspection-result__failed-item">
                  <button
                    type="button"
                    className="inspection-result__failed-header"
                    aria-expanded={isExpanded}
                    aria-controls={detailId}
                    aria-label={isExpanded ? copy.collapseLabel(check.name) : copy.expandLabel(check.name)}
                    onClick={() => toggle(key)}
                  >
                    <span className="inspection-result__failed-name">{check.name}</span>
                    {fields.code ? <code className="inspection-result__code">{fields.code}</code> : null}
                    <span className="inspection-result__chevron" data-expanded={isExpanded} aria-hidden="true" />
                  </button>
                  {isExpanded ? (
                    <div className="inspection-result__detail" id={detailId}>
                      {rows.length > 0 ? (
                        <dl className="inspection-result__detail-list">
                          {rows.map((row) => (
                            <Fragment key={row.key}>
                              <dt>{row.label}</dt>
                              <dd>{row.value}</dd>
                            </Fragment>
                          ))}
                        </dl>
                      ) : (
                        <p className="inspection-result__message">{copy.noDetail}</p>
                      )}
                      <div className="inspection-result__detail-actions">
                        <button
                          type="button"
                          className="inspection-result__copy"
                          onClick={() => void handleCopy(key, check)}
                          aria-label={copy.copyLabel(check.name)}
                        >
                          {copy.copyAction}
                        </button>
                        <span className="inspection-result__copy-feedback" role="status">
                          {feedback === "copied" ? copy.copied : feedback === "error" ? copy.copyFailed : ""}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {passed.length > 0 ? (
        <section className="inspection-result__group" data-tone="passed" aria-label={copy.passedHeading}>
          <h4 className="inspection-result__group-title">{copy.passedHeading}</h4>
          <ul className="inspection-result__list inspection-result__list--compact">
            {passed.map(({ key, check }) => (
              <li key={key} className="inspection-result__passed-item">
                <span className="inspection-result__check" aria-hidden="true">
                  ✓
                </span>
                <span className="inspection-result__name">{check.name}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {other.length > 0 ? (
        <section className="inspection-result__group" data-tone="other" aria-label={copy.otherHeading}>
          <h4 className="inspection-result__group-title">{copy.otherHeading}</h4>
          <ul className="inspection-result__list inspection-result__list--compact">
            {other.map(({ key, check }) => (
              <li key={key} className="inspection-result__other-item">
                <span className="inspection-result__name">{check.name}</span>
                <span className="inspection-result__status-chip">{copy.statusValue(check.status)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {checks.length === 0 ? <p className="inspection-result__message">{copy.emptyChecks}</p> : null}
    </section>
  );
}

export const inspectionResultUI = defineDataMessageUI<unknown>({
  name: INSPECTION_RESULT_EVENT,
  render: InspectionResultMessage,
});
