import { useAgentUILocaleCode, type DataMessageUIRenderProps } from "@za38.03/agent-ui-plugins";
import { useEffect, useId, useRef, useState } from "react";
import "./styles.css";

const localeMessages = {
  "zh-CN": {
    title: "检查结果",
    passedCount: (count: number) => `${count} 项通过`,
    failedCount: (count: number) => `${count} 项失败`,
    expandHint: "展开失败原因",
    collapseHint: "收起失败原因",
    copy: "复制错误详情",
    copied: "已复制",
    copyFailed: "复制失败，请手动选中文本",
    codeLabel: "错误码",
    messageLabel: "信息",
    durationLabel: "耗时",
  },
  "en-US": {
    title: "Inspection results",
    passedCount: (count: number) => `${count} passed`,
    failedCount: (count: number) => `${count} failed`,
    expandHint: "Show failure reason",
    collapseHint: "Hide failure reason",
    copy: "Copy error details",
    copied: "Copied",
    copyFailed: "Copy failed, select the text manually",
    codeLabel: "Code",
    messageLabel: "Message",
    durationLabel: "Duration",
  },
};

type Copy = typeof localeMessages["zh-CN"];

function resolveCopy(localeCode: string): Copy {
  return localeCode === "en-US" ? localeMessages["en-US"] : localeMessages["zh-CN"];
}

const FAILED_STATUSES = new Set(["failed", "fail", "failure", "error", "errored"]);
const PASSED_STATUSES = new Set(["passed", "pass", "ok", "success", "succeeded"]);

interface InspectionCheck {
  id: string;
  name: string;
  status: string;
  kind: "passed" | "failed" | "other";
  code: string | null;
  message: string | null;
  durationMs: number | null;
  detailValue: unknown;
  hasDetail: boolean;
}

interface NormalizedInspection {
  target: string | null;
  checks: InspectionCheck[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function normalizeInspection(data: unknown): NormalizedInspection {
  const payload: Record<string, unknown> = isRecord(data) ? data : {};
  const target = toText(payload["target"]);
  const rawChecks = Array.isArray(payload["checks"]) ? payload["checks"] : [];

  const checks: InspectionCheck[] = [];
  rawChecks.forEach((raw, index) => {
    const record: Record<string, unknown> = isRecord(raw) ? raw : {};
    const rawStatus = toText(record["status"]);
    const status = rawStatus ? rawStatus.toLowerCase() : "";
    const kind = FAILED_STATUSES.has(status)
      ? "failed"
      : PASSED_STATUSES.has(status)
        ? "passed"
        : "other";

    const detailValue = record["detail"] ?? record["error"] ?? null;
    const detailRecord: Record<string, unknown> = isRecord(detailValue) ? detailValue : {};
    const code = toText(detailRecord["code"]) ?? toText(detailRecord["errorCode"]);
    const scalarDetail = detailValue !== null && !isRecord(detailValue) ? toText(detailValue) : null;
    const message = toText(detailRecord["message"]) ?? toText(detailRecord["msg"]) ?? scalarDetail;
    const rawDuration = detailRecord["duration_ms"] ?? detailRecord["durationMs"];
    const durationMs =
      typeof rawDuration === "number" && Number.isFinite(rawDuration) ? rawDuration : null;

    checks.push({
      id: `check-${index}`,
      name: toText(record["name"]) ?? toText(record["title"]) ?? `#${index + 1}`,
      status: rawStatus ?? "",
      kind,
      code,
      message,
      durationMs,
      detailValue,
      hasDetail: detailValue !== null || code !== null || message !== null || durationMs !== null,
    });
  });

  return { target, checks };
}

function buildCopyText(check: InspectionCheck, target: string | null): string {
  const payload: Record<string, unknown> = {
    check: check.name,
    status: check.status || check.kind,
    detail: check.detailValue ?? check.message ?? null,
  };
  if (target) {
    payload["target"] = target;
  }
  return JSON.stringify(payload, null, 2);
}

export function InspectionResultMessagePlugin({ data }: DataMessageUIRenderProps<unknown>) {
  const localeCode = useAgentUILocaleCode();
  const copy = resolveCopy(localeCode);
  const [expandedIds, setExpandedIds] = useState<readonly string[]>([]);
  const [copyState, setCopyState] = useState<{ id: string; copied: boolean } | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseId = useId();

  useEffect(
    () => () => {
      if (resetTimer.current !== null) {
        clearTimeout(resetTimer.current);
      }
    },
    [],
  );

  const { target, checks } = normalizeInspection(data);
  const failed = checks.filter((check) => check.kind === "failed");
  const passed = checks.filter((check) => check.kind === "passed");
  const other = checks.filter((check) => check.kind === "other");

  function toggleExpanded(id: string) {
    setExpandedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  function showCopyState(id: string, copied: boolean) {
    setCopyState({ id, copied });
    if (resetTimer.current !== null) {
      clearTimeout(resetTimer.current);
    }
    resetTimer.current = setTimeout(() => {
      setCopyState(null);
    }, 2400);
  }

  async function copyDetails(check: InspectionCheck) {
    const text = buildCopyText(check, target);
    try {
      await navigator.clipboard.writeText(text);
      showCopyState(check.id, true);
    } catch {
      showCopyState(check.id, false);
    }
  }

  if (checks.length === 0) {
    return null;
  }

  return (
    <section
      className="inspection-result"
      data-has-failure={failed.length > 0 ? "true" : "false"}
      aria-label={copy.title}
    >
      <header className="inspection-result__header">
        <div className="inspection-result__title-row">
          <span className="inspection-result__indicator" aria-hidden="true" />
          <h3 className="inspection-result__title">{copy.title}</h3>
          {target ? <span className="inspection-result__target">{target}</span> : null}
        </div>
        <p className="inspection-result__summary">
          {passed.length > 0 ? (
            <span className="inspection-result__chip" data-tone="passed">
              {copy.passedCount(passed.length)}
            </span>
          ) : null}
          {failed.length > 0 ? (
            <span className="inspection-result__chip" data-tone="failed">
              {copy.failedCount(failed.length)}
            </span>
          ) : null}
        </p>
      </header>

      {failed.length > 0 ? (
        <ul className="inspection-result__failed-list">
          {failed.map((check) => {
            const expanded = expandedIds.includes(check.id);
            const panelId = `${baseId}-${check.id}`;
            const content = (
              <>
                <span className="inspection-result__failed-mark" aria-hidden="true">
                  !
                </span>
                <span className="inspection-result__failed-name">{check.name}</span>
                {check.code ? (
                  <code className="inspection-result__failed-code">{check.code}</code>
                ) : null}
                {check.hasDetail ? (
                  <span
                    className="inspection-result__chevron"
                    data-expanded={expanded ? "true" : "false"}
                    aria-hidden="true"
                  />
                ) : null}
              </>
            );

            return (
              <li key={check.id} className="inspection-result__failed-item">
                {check.hasDetail ? (
                  <button
                    type="button"
                    className="inspection-result__failed-toggle"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    aria-label={`${check.name}: ${expanded ? copy.collapseHint : copy.expandHint}`}
                    onClick={() => toggleExpanded(check.id)}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="inspection-result__failed-toggle" data-static="true">
                    {content}
                  </div>
                )}

                {check.hasDetail && expanded ? (
                  <div className="inspection-result__detail" id={panelId}>
                    <dl className="inspection-result__detail-list">
                      {check.code ? (
                        <>
                          <dt>{copy.codeLabel}</dt>
                          <dd>
                            <code>{check.code}</code>
                          </dd>
                        </>
                      ) : null}
                      {check.message ? (
                        <>
                          <dt>{copy.messageLabel}</dt>
                          <dd>{check.message}</dd>
                        </>
                      ) : null}
                      {check.durationMs !== null ? (
                        <>
                          <dt>{copy.durationLabel}</dt>
                          <dd>{check.durationMs} ms</dd>
                        </>
                      ) : null}
                    </dl>
                    <div className="inspection-result__detail-actions">
                      <button
                        type="button"
                        className="inspection-result__copy"
                        onClick={() => void copyDetails(check)}
                      >
                        {copy.copy}
                      </button>
                      <span
                        className="inspection-result__copy-status"
                        role="status"
                        aria-live="polite"
                      >
                        {copyState && copyState.id === check.id
                          ? copyState.copied
                            ? copy.copied
                            : copy.copyFailed
                          : ""}
                      </span>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {passed.length + other.length > 0 ? (
        <ul className="inspection-result__passed-list">
          {passed.map((check) => (
            <li key={check.id} className="inspection-result__passed-item">
              <span className="inspection-result__passed-mark" aria-hidden="true">
                ✓
              </span>
              <span className="inspection-result__passed-name">{check.name}</span>
            </li>
          ))}
          {other.map((check) => (
            <li key={check.id} className="inspection-result__passed-item" data-tone="other">
              <span className="inspection-result__passed-mark" aria-hidden="true">
                •
              </span>
              <span className="inspection-result__passed-name">{check.name}</span>
              {check.status ? (
                <span className="inspection-result__status-raw">{check.status}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
