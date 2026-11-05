import { Fragment, useCallback, useEffect, useId, useMemo, useState } from "react";
import { useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import {
  parseInspectionResult,
  type InspectionCheckDetail,
  type InspectionCheckView,
} from "./schema";
import "./styles.css";

const zhCN = {
  heading: "系统检查结果",
  targetLabel: "检查对象",
  checkLabel: "检查项",
  statusLabel: "状态",
  codeLabel: "错误码",
  messageLabel: "错误信息",
  durationLabel: "耗时",
  passed: "通过",
  failed: "失败",
  expand: "查看失败原因",
  collapse: "收起失败原因",
  copy: "复制错误详情",
  copied: "已复制",
  copyFailed: "复制失败，请手动选择文本",
  invalid: "检查结果数据格式不正确。",
  summary: (passed: number, failed: number) => `通过 ${passed} 项 · 失败 ${failed} 项`,
};

const enUS: typeof zhCN = {
  heading: "System check results",
  targetLabel: "Target",
  checkLabel: "Check",
  statusLabel: "Status",
  codeLabel: "Code",
  messageLabel: "Message",
  durationLabel: "Duration",
  passed: "Passed",
  failed: "Failed",
  expand: "Show failure reason",
  collapse: "Hide failure reason",
  copy: "Copy error details",
  copied: "Copied",
  copyFailed: "Copy failed, select the text manually",
  invalid: "Invalid inspection result data.",
  summary: (passed: number, failed: number) => `${passed} passed · ${failed} failed`,
};

type InspectionLabels = typeof zhCN;

type CopyFeedback = { key: string; status: "copied" | "failed" };

const KNOWN_DETAIL_KEYS = new Set(["code", "message", "duration_ms"]);

function formatDetailValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Extra detail fields that are not surfaced by the dedicated code/message/duration rows. */
function collectExtraFields(detail: InspectionCheckDetail | undefined): Array<[string, unknown]> {
  if (!detail) return [];
  return Object.entries(detail.raw).filter(([key]) => !KNOWN_DETAIL_KEYS.has(key));
}

function statusText(check: InspectionCheckView, labels: InspectionLabels): string {
  if (check.passed) return labels.passed;
  if (check.failed) return labels.failed;
  return check.status;
}

function buildErrorDetailText(
  target: string | undefined,
  check: InspectionCheckView,
  labels: InspectionLabels,
): string {
  const lines = [`${labels.checkLabel}: ${check.name}`];
  if (target) lines.push(`${labels.targetLabel}: ${target}`);
  lines.push(`${labels.statusLabel}: ${statusText(check, labels)}`);

  const detail = check.detail;
  if (detail?.code) lines.push(`${labels.codeLabel}: ${detail.code}`);
  if (detail?.message) lines.push(`${labels.messageLabel}: ${detail.message}`);
  if (typeof detail?.durationMs === "number") {
    lines.push(`${labels.durationLabel}: ${detail.durationMs} ms`);
  }

  const extraFields = collectExtraFields(detail);
  if (extraFields.length > 0) {
    lines.push("", JSON.stringify(Object.fromEntries(extraFields), null, 2));
  }

  return lines.join("\n");
}

async function writeClipboard(text: string): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error("clipboard-unavailable");
  }
  await navigator.clipboard.writeText(text);
}

function CheckGlyph() {
  return (
    <svg className="inspection-result__glyph" aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" focusable="false">
      <path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DashGlyph() {
  return (
    <svg className="inspection-result__glyph" aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" focusable="false">
      <path d="M4 8h8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ChevronGlyph({ open }: { open: boolean }) {
  return (
    <svg
      className="inspection-result__chevron"
      data-open={open ? "true" : "false"}
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      focusable="false"
    >
      <path
        d="M4 6l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" focusable="false">
      <path
        d="M6 3.5h6a1 1 0 0 1 1 1v7.5M3.5 5.5h6a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function InspectionResultMessagePlugin({ data }: { data: unknown }) {
  const localeCode = useAgentUILocaleCode();
  const labels = localeCode === "en-US" ? enUS : zhCN;
  const parsed = useMemo(() => parseInspectionResult(data), [data]);
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);

  useEffect(() => {
    if (!copyFeedback) return;
    const timer = window.setTimeout(() => setCopyFeedback(null), 2200);
    return () => window.clearTimeout(timer);
  }, [copyFeedback]);

  const toggleExpanded = useCallback((key: string) => {
    setExpandedKeys((previous) => ({ ...previous, [key]: !previous[key] }));
  }, []);

  const handleCopy = useCallback(async (key: string, text: string) => {
    try {
      await writeClipboard(text);
      setCopyFeedback({ key, status: "copied" });
    } catch {
      setCopyFeedback({ key, status: "failed" });
    }
  }, []);

  if (!parsed.ok) {
    return (
      <section className="inspection-result inspection-result--invalid" role="alert">
        {labels.invalid}
      </section>
    );
  }

  const { target, checks } = parsed.value;
  const failedCount = checks.filter((check) => check.failed).length;
  const passedCount = checks.filter((check) => check.passed).length;

  return (
    <section className="inspection-result" aria-label={labels.heading}>
      <header className="inspection-result__header">
        <h3 className="inspection-result__title">{labels.heading}</h3>
        {target ? (
          <span className="inspection-result__target">
            {labels.targetLabel}: {target}
          </span>
        ) : null}
        <span className="inspection-result__summary">{labels.summary(passedCount, failedCount)}</span>
      </header>

      <ul className="inspection-result__list">
        {checks.map((check, index) => {
          const key = `${index}:${check.name}`;

          if (!check.failed) {
            return (
              <li
                key={key}
                className={
                  check.passed
                    ? "inspection-result__item inspection-result__item--passed"
                    : "inspection-result__item inspection-result__item--neutral"
                }
              >
                <span
                  className={
                    check.passed
                      ? "inspection-result__glyph-wrap"
                      : "inspection-result__glyph-wrap inspection-result__glyph-wrap--neutral"
                  }
                  aria-hidden="true"
                >
                  {check.passed ? <CheckGlyph /> : <DashGlyph />}
                </span>
                <span className="inspection-result__name">{check.name}</span>
                <span className="inspection-result__badge inspection-result__badge--passed">
                  {statusText(check, labels)}
                </span>
              </li>
            );
          }

          const panelId = `inspection-result-panel-${rawId}-${index}`;
          const expanded = expandedKeys[key] === true;
          const feedback = copyFeedback?.key === key ? copyFeedback.status : null;
          const extraFields = collectExtraFields(check.detail);
          const detail = check.detail;
          const hasDetail =
            Boolean(detail?.code) ||
            Boolean(detail?.message) ||
            typeof detail?.durationMs === "number" ||
            extraFields.length > 0;

          return (
            <li key={key} className="inspection-result__item inspection-result__item--failed">
              <button
                type="button"
                className="inspection-result__toggle"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggleExpanded(key)}
              >
                <span className="inspection-result__name">{check.name}</span>
                <span className="inspection-result__badge inspection-result__badge--failed">{labels.failed}</span>
                <span className="inspection-result__hint">{expanded ? labels.collapse : labels.expand}</span>
                <ChevronGlyph open={expanded} />
              </button>

              <div id={panelId} className="inspection-result__panel" hidden={!expanded}>
                {hasDetail ? (
                  <dl className="inspection-result__detail">
                    {detail?.code ? (
                      <>
                        <dt>{labels.codeLabel}</dt>
                        <dd>{detail.code}</dd>
                      </>
                    ) : null}
                    {detail?.message ? (
                      <>
                        <dt>{labels.messageLabel}</dt>
                        <dd>{detail.message}</dd>
                      </>
                    ) : null}
                    {typeof detail?.durationMs === "number" ? (
                      <>
                        <dt>{labels.durationLabel}</dt>
                        <dd>{detail.durationMs} ms</dd>
                      </>
                    ) : null}
                    {extraFields.map(([field, value]) => (
                      <Fragment key={field}>
                        <dt>{field}</dt>
                        <dd>{formatDetailValue(value)}</dd>
                      </Fragment>
                    ))}
                  </dl>
                ) : null}

                <div className="inspection-result__actions">
                  <button
                    type="button"
                    className="inspection-result__copy"
                    aria-label={`${labels.copy}: ${check.name}`}
                    onClick={() => {
                      void handleCopy(key, buildErrorDetailText(target, check, labels));
                    }}
                  >
                    <CopyGlyph />
                    <span>{labels.copy}</span>
                  </button>
                  {feedback ? (
                    <span className="inspection-result__feedback" role="status" aria-live="polite">
                      {feedback === "copied" ? labels.copied : labels.copyFailed}
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
