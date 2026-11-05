import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import { parseInspectionResult, type InspectionCheckView } from "./schema";
import "./styles.css";

const zhCN = {
  heading: "系统检查结果",
  targetLabel: "检查对象",
  checkLabel: "检查项",
  statusLabel: "状态",
  codeLabel: "错误码",
  messageLabel: "错误信息",
  durationLabel: "耗时",
  expand: "查看失败原因",
  collapse: "收起失败原因",
  copy: "复制错误详情",
  copied: "已复制",
  copyFailed: "复制失败，请手动选择文本",
  invalid: "检查结果数据格式不正确。",
  passed: "通过",
  failed: "失败",
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
  expand: "Show failure reason",
  collapse: "Hide failure reason",
  copy: "Copy error details",
  copied: "Copied",
  copyFailed: "Copy failed, select the text manually",
  invalid: "Invalid inspection result data.",
  passed: "Passed",
  failed: "Failed",
  summary: (passed: number, failed: number) => `${passed} passed · ${failed} failed`,
};

type InspectionLabels = typeof zhCN;

type CopyFeedback = { key: string; status: "copied" | "failed" };

function buildErrorDetailText(
  target: string | undefined,
  check: InspectionCheckView,
  labels: InspectionLabels,
): string {
  const lines = [`${labels.checkLabel}: ${check.name}`];
  if (target) lines.push(`${labels.targetLabel}: ${target}`);
  lines.push(`${labels.statusLabel}: ${check.status}`);

  const detail = check.detail;
  if (detail?.code) lines.push(`${labels.codeLabel}: ${detail.code}`);
  if (detail?.message) lines.push(`${labels.messageLabel}: ${detail.message}`);
  if (typeof detail?.durationMs === "number") {
    lines.push(`${labels.durationLabel}: ${detail.durationMs} ms`);
  }
  if (detail) lines.push("", JSON.stringify(detail.raw, null, 2));

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
  const passedCount = checks.length - failedCount;

  return (
    <section className="inspection-result" aria-label={labels.heading}>
      <header className="inspection-result__header">
        <h3 className="inspection-result__title">{labels.heading}</h3>
        {target ? (
          <span className="inspection-result__target">
            {labels.targetLabel}: {target}
          </span>
        ) : null}
        <span className="inspection-result__summary">
          {failedCount > 0 ? (
            <span className="inspection-result__count inspection-result__count--failed">{failedCount}</span>
          ) : null}
          <span className="inspection-result__count-label">{labels.summary(passedCount, failedCount)}</span>
        </span>
      </header>

      <ul className="inspection-result__list">
        {checks.map((check, index) => {
          const key = `${index}:${check.name}`;

          if (!check.failed) {
            return (
              <li
                key={key}
                className={`inspection-result__item ${
                  check.passed ? "inspection-result__item--passed" : "inspection-result__item--other"
                }`}
              >
                {check.passed ? (
                  <span className="inspection-result__glyph-wrap" aria-hidden="true">
                    <CheckGlyph />
                  </span>
                ) : null}
                <span className="inspection-result__name">{check.name}</span>
                <span
                  className={`inspection-result__badge ${
                    check.passed ? "inspection-result__badge--passed" : "inspection-result__badge--other"
                  }`}
                >
                  {check.passed ? labels.passed : check.status}
                </span>
              </li>
            );
          }

          const panelId = `inspection-result-panel-${rawId}-${index}`;
          const expanded = expandedKeys[key] === true;
          const feedback = copyFeedback?.key === key ? copyFeedback.status : null;

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
                {check.detail ? (
                  <dl className="inspection-result__detail">
                    {check.detail.code ? (
                      <>
                        <dt>{labels.codeLabel}</dt>
                        <dd>{check.detail.code}</dd>
                      </>
                    ) : null}
                    {check.detail.message ? (
                      <>
                        <dt>{labels.messageLabel}</dt>
                        <dd>{check.detail.message}</dd>
                      </>
                    ) : null}
                    {typeof check.detail.durationMs === "number" ? (
                      <>
                        <dt>{labels.durationLabel}</dt>
                        <dd>{check.detail.durationMs} ms</dd>
                      </>
                    ) : null}
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
