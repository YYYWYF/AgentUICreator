import { useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import { useState } from "react";

import {
  inspectionResultFallback,
  inspectionResultLocale,
  type InspectionResultLabels,
} from "./locale";
import { parseInspectionResult, type InspectionCheck } from "./schema";
import "./styles.css";

type DetailField = "code" | "message" | "duration";

function readDetailFields(detail: unknown): Array<{ field: DetailField; value: string }> {
  if (!detail || typeof detail !== "object") return [];
  const record = detail as Record<string, unknown>;
  const fields: Array<{ field: DetailField; value: string }> = [];

  const code = record.code;
  if (typeof code === "string" && code.trim().length > 0) {
    fields.push({ field: "code", value: code });
  }

  const message = record.message;
  if (typeof message === "string" && message.trim().length > 0) {
    fields.push({ field: "message", value: message });
  }

  const duration = record.duration_ms;
  if (typeof duration === "number" && Number.isFinite(duration)) {
    fields.push({ field: "duration", value: String(duration) });
  }

  return fields;
}

function rawDetailText(detail: unknown): string {
  if (detail === undefined || detail === null) return "";
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail, null, 2) ?? "";
  } catch {
    return String(detail);
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the selection based fallback
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
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

type CopyState = "idle" | "copied" | "failed";

function FailedCheck({
  check,
  labels,
}: {
  check: InspectionCheck;
  labels: InspectionResultLabels;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const fields = readDetailFields(check.detail);
  const raw = rawDetailText(check.detail);
  const fieldLabels: Record<DetailField, string> = {
    code: labels.code,
    message: labels.message,
    duration: labels.duration,
  };

  const handleCopy = async () => {
    const text = raw.length > 0 ? `${check.name}\n${raw}` : check.name;
    const copied = await copyToClipboard(text);
    setCopyState(copied ? "copied" : "failed");
  };

  return (
    <li className="inspection-result__failed-item">
      <button
        type="button"
        className="inspection-result__failed-toggle"
        aria-expanded={expanded}
        aria-label={`${check.name} · ${labels.failedLabel} · ${expanded ? labels.collapseReason : labels.expandReason}`}
        onClick={() => setExpanded((previous) => !previous)}
      >
        <span className="inspection-result__mark" aria-hidden="true">
          !
        </span>
        <span className="inspection-result__check-name">{check.name}</span>
        <span className="inspection-result__failed-label">{labels.failedLabel}</span>
        <span className="inspection-result__indicator" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded ? (
        <div className="inspection-result__detail">
          {fields.length > 0 ? (
            <dl className="inspection-result__detail-list">
              {fields.map((entry) => (
                <div key={entry.field} className="inspection-result__detail-row">
                  <dt>{fieldLabels[entry.field]}</dt>
                  <dd>
                    {entry.field === "duration"
                      ? `${entry.value} ${labels.milliseconds}`
                      : entry.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {fields.length === 0 && raw.length > 0 ? (
            <pre className="inspection-result__detail-raw">{raw}</pre>
          ) : null}
          <div className="inspection-result__detail-actions">
            <button type="button" className="inspection-result__copy" onClick={handleCopy}>
              {labels.copyDetail}
            </button>
            <span className="inspection-result__copy-status" role="status">
              {copyState === "copied" ? labels.copied : null}
              {copyState === "failed" ? labels.copyFailed : null}
            </span>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function InspectionResultMessage({ data }: { data: unknown }) {
  const labels = inspectionResultLocale[useAgentUILocaleCode()] ?? inspectionResultFallback;
  const parsed = parseInspectionResult(data);

  if (!parsed.success) {
    return (
      <p className="inspection-result inspection-result--invalid" role="alert">
        {labels.invalidData}
      </p>
    );
  }

  const { target, checks } = parsed.data;
  const passed = checks.filter((check) => check.status === "passed");
  const failed = checks.filter((check) => check.status === "failed");
  const other = checks.filter(
    (check) => check.status !== "passed" && check.status !== "failed",
  );

  return (
    <section className="inspection-result" aria-label={labels.heading}>
      <header className="inspection-result__header">
        <h3 className="inspection-result__heading">{labels.heading}</h3>
        <p className="inspection-result__target">
          <span className="inspection-result__target-label">{labels.targetLabel}</span>
          <span className="inspection-result__target-value">{target}</span>
        </p>
      </header>

      {passed.length > 0 ? (
        <div className="inspection-result__group">
          <p className="inspection-result__group-title">
            {labels.passedHeading} · {passed.length}
          </p>
          <ul className="inspection-result__passed-list">
            {passed.map((check, index) => (
              <li key={`${check.name}-${index}`} className="inspection-result__passed-item">
                <span className="inspection-result__mark" aria-hidden="true">
                  ✓
                </span>
                <span className="inspection-result__check-name">{check.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {failed.length > 0 ? (
        <div className="inspection-result__group">
          <p className="inspection-result__group-title">
            {labels.failedHeading} · {failed.length}
          </p>
          <ul className="inspection-result__failed-list">
            {failed.map((check, index) => (
              <FailedCheck key={`${check.name}-${index}`} check={check} labels={labels} />
            ))}
          </ul>
        </div>
      ) : null}

      {other.length > 0 ? (
        <div className="inspection-result__group">
          <p className="inspection-result__group-title">
            {labels.otherHeading} · {other.length}
          </p>
          <ul className="inspection-result__other-list">
            {other.map((check, index) => (
              <li key={`${check.name}-${index}`} className="inspection-result__other-item">
                <span className="inspection-result__check-name">{check.name}</span>
                <span className="inspection-result__other-status">{check.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
