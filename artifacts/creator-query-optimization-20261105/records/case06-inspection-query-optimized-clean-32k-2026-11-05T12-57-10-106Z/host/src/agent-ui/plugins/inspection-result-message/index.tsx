import type { DataMessageUIRenderProps } from "@za38.03/agent-ui-plugins";
import { useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import "./styles.css";

type InspectionMessages = {
  title: string;
  summary: (passedCount: number, failedCount: number) => string;
  passedGroup: string;
  failedGroup: string;
  expand: string;
  collapse: string;
  copy: string;
  copied: string;
  copyFailed: string;
  codeLabel: string;
  messageLabel: string;
  duration: string;
  noDetail: string;
  empty: string;
  unreadable: string;
  statusLabels: Record<string, string>;
};

const localeMessages: Record<string, InspectionMessages> = {
  "zh-CN": {
    title: "检查结果",
    summary: (passedCount, failedCount) =>
      failedCount > 0 ? `${passedCount} 项通过 · ${failedCount} 项失败` : `${passedCount} 项通过`,
    passedGroup: "通过",
    failedGroup: "失败",
    expand: "展开原因",
    collapse: "收起原因",
    copy: "复制错误详情",
    copied: "已复制",
    copyFailed: "复制失败",
    codeLabel: "错误码",
    messageLabel: "说明",
    duration: "耗时",
    noDetail: "未提供更多错误详情",
    empty: "没有可展示的检查项",
    unreadable: "检查结果数据格式无法识别",
    statusLabels: {
      passed: "通过",
      failed: "失败",
      error: "错误",
      warning: "警告",
      skipped: "跳过",
    },
  },
  "en-US": {
    title: "Inspection result",
    summary: (passedCount, failedCount) =>
      failedCount > 0 ? `${passedCount} passed · ${failedCount} failed` : `${passedCount} passed`,
    passedGroup: "Passed",
    failedGroup: "Failed",
    expand: "Show reason",
    collapse: "Hide reason",
    copy: "Copy error detail",
    copied: "Copied",
    copyFailed: "Copy failed",
    codeLabel: "Code",
    messageLabel: "Message",
    duration: "Duration",
    noDetail: "No further error detail provided",
    empty: "No checks to display",
    unreadable: "Unrecognized inspection result data",
    statusLabels: {
      passed: "Passed",
      failed: "Failed",
      error: "Error",
      warning: "Warning",
      skipped: "Skipped",
    },
  },
};

type DetailEntry = { key: string; value: string };

type InspectionCheck = {
  key: string;
  name: string;
  status: string;
  statusLabel: string;
  passed: boolean;
  detailEntries: DetailEntry[];
};

type ParsedInspection = {
  target: string | undefined;
  checks: InspectionCheck[];
};

function toText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function formatDetailValue(value: unknown): string | undefined {
  const text = toText(value);
  if (text !== undefined) {
    return text;
  }
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function toDetailEntries(detail: Record<string, unknown>): DetailEntry[] {
  const entries: DetailEntry[] = [];
  for (const [key, value] of Object.entries(detail)) {
    const formatted = formatDetailValue(value);
    if (formatted === undefined) {
      continue;
    }
    entries.push({ key, value: key === "duration_ms" && typeof value === "number" ? `${value} ms` : formatted });
  }
  return entries;
}

function parseCheck(raw: unknown, index: number, messages: InspectionMessages): InspectionCheck {
  const record = toRecord(raw) ?? {};
  const name = toText(record.name) ?? toText(record.title) ?? `#${index + 1}`;
  const status = (toText(record.status) ?? "unknown").toLowerCase();
  const detailRecord = toRecord(record.detail);
  const detailText = toText(record.detail);

  const detailEntries: DetailEntry[] = [];
  if (detailRecord) {
    detailEntries.push(...toDetailEntries(detailRecord));
  } else if (detailText !== undefined) {
    detailEntries.push({ key: "message", value: detailText });
  }
  if (detailEntries.length === 0) {
    const fallbackRecord: Record<string, unknown> = {};
    if (record.code !== undefined) fallbackRecord.code = record.code;
    if (record.message !== undefined) fallbackRecord.message = record.message;
    if (record.duration_ms !== undefined) fallbackRecord.duration_ms = record.duration_ms;
    if (record.reason !== undefined) fallbackRecord.reason = record.reason;
    detailEntries.push(...toDetailEntries(fallbackRecord));
  }

  return {
    key: `${index}`,
    name,
    status,
    statusLabel: messages.statusLabels[status] ?? status,
    passed: status === "passed",
    detailEntries,
  };
}

function parseInspectionResult(data: unknown, messages: InspectionMessages): ParsedInspection | undefined {
  const record = toRecord(data);
  if (!record) {
    return undefined;
  }
  const target = toText(record.target);
  const rawChecks = Array.isArray(record.checks) ? record.checks : [];
  const checks = rawChecks.map((raw, index) => parseCheck(raw, index, messages));
  if (target === undefined && checks.length === 0) {
    return undefined;
  }
  return { target, checks };
}

function detailLabel(messages: InspectionMessages, key: string): string {
  if (key === "code") return messages.codeLabel;
  if (key === "message") return messages.messageLabel;
  if (key === "duration_ms") return messages.duration;
  return key;
}

function buildErrorDetailText(target: string | undefined, check: InspectionCheck): string {
  const lines: string[] = [];
  if (target !== undefined) {
    lines.push(`target: ${target}`);
  }
  lines.push(`check: ${check.name}`);
  lines.push(`status: ${check.status}`);
  for (const entry of check.detailEntries) {
    lines.push(`${entry.key}: ${entry.value}`);
  }
  return lines.join("\n");
}

async function copyToClipboard(text: string): Promise<boolean> {
  const clipboard = typeof navigator === "undefined" ? undefined : (navigator.clipboard as Clipboard | undefined);
  if (clipboard && typeof clipboard.writeText === "function") {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the selection-based fallback below.
    }
  }
  if (typeof document === "undefined") {
    return false;
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

type CopyState = { key: string; checkName: string; ok: boolean };

export function InspectionResultMessagePlugin({ data }: DataMessageUIRenderProps<unknown>) {
  const localeCode = useAgentUILocaleCode();
  const messages = localeMessages[localeCode] ?? localeMessages["zh-CN"]!;
  const idPrefix = useId();
  const parsed = useMemo(() => parseInspectionResult(data, messages), [data, messages]);
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [copyState, setCopyState] = useState<CopyState | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, []);

  const toggleCheck = useCallback((key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleCopy = useCallback(async (key: string, checkName: string, text: string) => {
    const ok = await copyToClipboard(text);
    setCopyState({ key, checkName, ok });
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => {
      setCopyState(null);
      resetTimerRef.current = null;
    }, 2200);
  }, []);

  if (!parsed) {
    return (
      <section className="inspection-result" aria-label={messages.title}>
        <p className="inspection-result__empty">{messages.unreadable}</p>
      </section>
    );
  }

  const passedChecks = parsed.checks.filter((check) => check.passed);
  const failedChecks = parsed.checks.filter((check) => !check.passed);
  const announcement = copyState
    ? `${copyState.checkName}: ${copyState.ok ? messages.copied : messages.copyFailed}`
    : "";

  return (
    <section
      className="inspection-result"
      aria-label={messages.title}
      data-outcome={failedChecks.length > 0 ? "failed" : "passed"}
    >
      <header className="inspection-result__header">
        <h3 className="inspection-result__title">{messages.title}</h3>
        {parsed.target ? (
          <span className="inspection-result__target" title={parsed.target}>
            {parsed.target}
          </span>
        ) : null}
        <span className="inspection-result__summary">
          {messages.summary(passedChecks.length, failedChecks.length)}
        </span>
      </header>

      {parsed.checks.length === 0 ? <p className="inspection-result__empty">{messages.empty}</p> : null}

      {passedChecks.length > 0 ? (
        <div className="inspection-result__group">
          <p className="inspection-result__group-label">{messages.passedGroup}</p>
          <ul className="inspection-result__passed-list">
            {passedChecks.map((check) => (
              <li className="inspection-result__passed" key={check.key}>
                <span className="inspection-result__passed-icon" aria-hidden="true">
                  ✓
                </span>
                <span className="inspection-result__passed-name">{check.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {failedChecks.length > 0 ? (
        <div className="inspection-result__group">
          <p className="inspection-result__group-label inspection-result__group-label--failed">
            {messages.failedGroup}
          </p>
          <ul className="inspection-result__failed-list">
            {failedChecks.map((check) => {
              const expanded = expandedKeys.has(check.key);
              const panelId = `${idPrefix}-detail-${check.key}`;
              return (
                <li
                  className="inspection-result__failed"
                  key={check.key}
                  data-expanded={expanded ? "true" : "false"}
                >
                  <button
                    type="button"
                    className="inspection-result__failed-header"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => toggleCheck(check.key)}
                  >
                    <span className="inspection-result__failed-icon" aria-hidden="true">
                      !
                    </span>
                    <span className="inspection-result__failed-name">{check.name}</span>
                    <span className="inspection-result__failed-status">{check.statusLabel}</span>
                    <span className="inspection-result__failed-hint">
                      {expanded ? messages.collapse : messages.expand}
                    </span>
                    <span className="inspection-result__failed-chevron" aria-hidden="true">
                      {expanded ? "−" : "+"}
                    </span>
                  </button>
                  {expanded ? (
                    <div className="inspection-result__detail" id={panelId}>
                      {check.detailEntries.length > 0 ? (
                        <dl className="inspection-result__detail-list">
                          {check.detailEntries.map((entry) => (
                            <div className="inspection-result__detail-row" key={entry.key}>
                              <dt className="inspection-result__detail-key">
                                {detailLabel(messages, entry.key)}
                              </dt>
                              <dd className="inspection-result__detail-value">{entry.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="inspection-result__detail-empty">{messages.noDetail}</p>
                      )}
                      <button
                        type="button"
                        className="inspection-result__copy"
                        onClick={() => {
                          void handleCopy(check.key, check.name, buildErrorDetailText(parsed.target, check));
                        }}
                      >
                        {messages.copy}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <p className="inspection-result__announcement" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
