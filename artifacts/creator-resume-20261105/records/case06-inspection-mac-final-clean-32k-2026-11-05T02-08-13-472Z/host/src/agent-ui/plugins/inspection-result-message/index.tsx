import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import "./styles.css";

type InspectionDetail = Record<string, unknown>;

type InspectionCheck = {
  name: string;
  status: string;
  passed: boolean;
  detail?: InspectionDetail;
};

type InspectionResult = {
  target?: string;
  checks: InspectionCheck[];
};

type InspectionMessages = {
  title: string;
  targetLabel: string;
  statusLabel: string;
  codeLabel: string;
  messageLabel: string;
  durationLabel: string;
  passedSummary: (count: number) => string;
  failedSummary: (count: number) => string;
  passedGroup: string;
  failedGroup: string;
  allPassed: string;
  empty: string;
  expandHint: string;
  copy: string;
  copied: string;
  copyFailed: string;
  noDetail: string;
  passed: string;
  failed: string;
  unknownStatus: string;
};

const messages: Record<string, InspectionMessages> = {
  "zh-CN": {
    title: "检查结果",
    targetLabel: "目标",
    statusLabel: "状态",
    codeLabel: "错误码",
    messageLabel: "错误信息",
    durationLabel: "耗时",
    passedSummary: (count) => `${count} 项通过`,
    failedSummary: (count) => `${count} 项失败`,
    passedGroup: "通过的检查项",
    failedGroup: "失败的检查项",
    allPassed: "全部检查项通过",
    empty: "本次检查没有返回检查项",
    expandHint: "点击展开原因",
    copy: "复制错误详情",
    copied: "已复制",
    copyFailed: "复制失败，请手动选择文本",
    noDetail: "没有返回更多错误详情",
    passed: "通过",
    failed: "失败",
    unknownStatus: "未识别状态",
  },
  "en-US": {
    title: "Inspection result",
    targetLabel: "Target",
    statusLabel: "Status",
    codeLabel: "Code",
    messageLabel: "Message",
    durationLabel: "Duration",
    passedSummary: (count) => `${count} passed`,
    failedSummary: (count) => `${count} failed`,
    passedGroup: "Passed checks",
    failedGroup: "Failed checks",
    allPassed: "All checks passed",
    empty: "No checks were returned",
    expandHint: "Expand for details",
    copy: "Copy error details",
    copied: "Copied",
    copyFailed: "Copy failed — select the text manually",
    noDetail: "No further error details were returned",
    passed: "Passed",
    failed: "Failed",
    unknownStatus: "Unknown status",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeDetail(value: unknown): InspectionDetail | undefined {
  if (value === undefined || value === null) return undefined;
  if (isRecord(value)) return value;
  if (typeof value === "string") return { message: value };
  return { message: String(value) };
}

function normalizeInspection(data: unknown): InspectionResult | undefined {
  if (!isRecord(data)) return undefined;
  const rawChecks = Array.isArray(data.checks) ? data.checks : undefined;
  if (!rawChecks) return undefined;

  const checks: InspectionCheck[] = [];
  rawChecks.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const status = typeof entry.status === "string" && entry.status.trim() ? entry.status.trim() : "unknown";
    const rawName = typeof entry.name === "string" ? entry.name.trim() : "";
    checks.push({
      name: rawName || `#${index + 1}`,
      status,
      passed: status.toLowerCase() === "passed",
      detail: normalizeDetail(entry.detail),
    });
  });

  const target = typeof data.target === "string" && data.target.trim() ? data.target.trim() : undefined;
  return { target, checks };
}

function statusLabel(status: string, t: InspectionMessages): string {
  const normalized = status.toLowerCase();
  if (normalized === "passed") return t.passed;
  if (normalized === "failed") return t.failed;
  return status.trim() || t.unknownStatus;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const detailLabels: Record<string, keyof InspectionMessages> = {
  code: "codeLabel",
  message: "messageLabel",
  duration_ms: "durationLabel",
};

function detailRows(detail: InspectionDetail | undefined, t: InspectionMessages) {
  if (!detail) return [];
  const rows: { key: string; label: string; value: string }[] = [];
  for (const [key, value] of Object.entries(detail)) {
    if (value === undefined || value === null || value === "") continue;
    const labelKey = detailLabels[key];
    const label = labelKey ? (t[labelKey] as string) : key;
    const formatted = key === "duration_ms" && typeof value === "number" ? `${value} ms` : formatValue(value);
    rows.push({ key, label, value: formatted });
  }
  return rows;
}

function buildCopyText(check: InspectionCheck, target: string | undefined, t: InspectionMessages): string {
  const lines: string[] = [check.name];
  if (target) lines.push(`${t.targetLabel}: ${target}`);
  lines.push(`${t.statusLabel}: ${statusLabel(check.status, t)}`);
  for (const row of detailRows(check.detail, t)) {
    lines.push(`${row.label}: ${row.value}`);
  }
  return lines.join("\n");
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path below
  }

  if (typeof document === "undefined") return false;
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = typeof document.execCommand === "function" ? document.execCommand("copy") : false;
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}

export function InspectionResultMessagePlugin({ data }: { data?: unknown }) {
  const localeCode = useAgentUILocaleCode();
  const t = messages[localeCode] ?? messages["zh-CN"]!;
  const result = useMemo(() => normalizeInspection(data), [data]);
  const [copyState, setCopyState] = useState<{ key: string; ok: boolean } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback((key: string, text: string) => {
    void copyTextToClipboard(text).then((ok) => {
      setCopyState({ key, ok });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopyState(null), 2400);
    });
  }, []);

  if (!result) return null;

  const failedChecks = result.checks.filter((check) => !check.passed);
  const passedChecks = result.checks.filter((check) => check.passed);

  return (
    <section className="inspection-result" data-inspection-result="true" aria-label={t.title}>
      <header className="inspection-result__header">
        <h4 className="inspection-result__title">
          <span className="inspection-result__title-text">{t.title}</span>
          {result.target ? <span className="inspection-result__target">{result.target}</span> : null}
        </h4>
        <div className="inspection-result__summary">
          {failedChecks.length > 0 ? (
            <span className="inspection-result__badge inspection-result__badge--failed">
              {t.failedSummary(failedChecks.length)}
            </span>
          ) : null}
          <span className="inspection-result__badge inspection-result__badge--passed">
            {t.passedSummary(passedChecks.length)}
          </span>
        </div>
      </header>

      {result.checks.length === 0 ? <p className="inspection-result__empty">{t.empty}</p> : null}

      {passedChecks.length > 0 ? (
        <ul className="inspection-result__list inspection-result__list--passed" aria-label={t.passedGroup}>
          {passedChecks.map((check, index) => (
            <li key={`passed-${index}`} className="inspection-result__passed-item" data-check-status="passed">
              <span className="inspection-result__check-mark" aria-hidden="true">
                ✓
              </span>
              <span className="inspection-result__name">{check.name}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {failedChecks.length > 0 ? (
        <ul className="inspection-result__list inspection-result__list--failed" aria-label={t.failedGroup}>
          {failedChecks.map((check, index) => {
            const itemKey = `failed-${index}`;
            const rows = detailRows(check.detail, t);
            const feedback = copyState?.key === itemKey ? (copyState.ok ? t.copied : t.copyFailed) : "";
            return (
              <li key={itemKey} className="inspection-result__failed-item" data-check-status="failed">
                <details className="inspection-result__details">
                  <summary className="inspection-result__summary-row">
                    <span className="inspection-result__name">{check.name}</span>
                    <span className="inspection-result__status-chip">{statusLabel(check.status, t)}</span>
                    <span className="inspection-result__hint">{t.expandHint}</span>
                  </summary>
                  <div className="inspection-result__detail">
                    {rows.length > 0 ? (
                      <dl className="inspection-result__detail-list">
                        {rows.map((row) => (
                          <div key={row.key} className="inspection-result__detail-row">
                            <dt className="inspection-result__detail-label">{row.label}</dt>
                            <dd className="inspection-result__detail-value">{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="inspection-result__detail-empty">{t.noDetail}</p>
                    )}
                    <div className="inspection-result__actions">
                      <button
                        type="button"
                        className="inspection-result__copy"
                        onClick={() => handleCopy(itemKey, buildCopyText(check, result.target, t))}
                      >
                        {copyState?.key === itemKey && copyState.ok ? t.copied : t.copy}
                      </button>
                      <span className="inspection-result__sr" role="status" aria-live="polite">
                        {feedback}
                      </span>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      ) : null}

      {result.checks.length > 0 && failedChecks.length === 0 ? (
        <p className="inspection-result__ok">{t.allPassed}</p>
      ) : null}
    </section>
  );
}
