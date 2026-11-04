import { useEffect, useMemo, useRef, useState } from "react";
import { useAgentUILocaleCode, usePluginEvents } from "@za38.03/agent-ui-plugins";
import "./styles.css";

/** Name of the business event published by the Agent for task progress. */
export const JOB_PROGRESS_EVENT_NAME = "app.job.progress";

type JobPhase = "running" | "completed" | "failed";

interface JobErrorInfo {
  code?: string;
  message?: string;
}

interface JobRecord {
  jobId: string;
  title: string;
  status: string;
  completed: number;
  total: number;
  error: JobErrorInfo | null;
}

const COMPLETED_STATUSES = new Set(["completed", "complete", "done", "succeeded", "success", "finished", "ok"]);
const FAILED_STATUSES = new Set(["failed", "failure", "error", "errored", "cancelled", "canceled", "aborted", "timeout", "rejected"]);

function normalizeStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function readCount(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return fallback;
}

function readText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readError(value: unknown): JobErrorInfo | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const code = readText(record.code);
  const message = readText(record.message);
  if (!code && !message) return null;
  return { code, message };
}

function resolvePhase(job: JobRecord): JobPhase {
  const status = normalizeStatus(job.status);
  if (job.error) return "failed";
  if (FAILED_STATUSES.has(status)) return "failed";
  if (COMPLETED_STATUSES.has(status)) return "completed";
  if (job.total > 0 && job.completed >= job.total) return "completed";
  return "running";
}

function mergeJob(previous: JobRecord | undefined, payload: Record<string, unknown>): JobRecord {
  const completed = readCount(payload.completed, previous ? previous.completed : 0);
  const total = readCount(payload.total, previous ? previous.total : 0);
  const error = "error" in payload ? readError(payload.error) : previous ? previous.error : null;
  return {
    jobId: previous ? previous.jobId : String(payload.job_id),
    title: readText(payload.title) ?? (previous ? previous.title : ""),
    status: readText(payload.status) ?? (previous ? previous.status : ""),
    completed,
    total,
    error,
  };
}

function upsertJob(previous: JobRecord[], payload: Record<string, unknown>): JobRecord[] {
  const jobId = String(payload.job_id);
  const index = previous.findIndex((job) => job.jobId === jobId);
  if (index === -1) return [...previous, mergeJob(undefined, payload)];
  const next = previous.slice();
  next[index] = mergeJob(previous[index], payload);
  return next;
}

interface LocaleMessages {
  title: string;
  empty: string;
  active: (count: number) => string;
  progress: (completed: number, total: number) => string;
  errorSummary: string;
  errorCode: string;
  errorMessage: string;
  errorUnknown: string;
  status: Record<JobPhase, string>;
}

const localeMessages: Record<string, LocaleMessages> = {
  "zh-CN": {
    title: "任务进度",
    empty: "暂无任务进度",
    active: (count) => `进行中 ${count} 项`,
    progress: (completed, total) => (total > 0 ? `${completed} / ${total}` : `${completed} 步`),
    errorSummary: "查看错误原因",
    errorCode: "错误代码",
    errorMessage: "错误说明",
    errorUnknown: "未提供",
    status: { running: "进行中", completed: "已完成", failed: "失败" },
  },
  "en-US": {
    title: "Task progress",
    empty: "No task progress yet",
    active: (count) => `${count} running`,
    progress: (completed, total) => (total > 0 ? `${completed} / ${total}` : `${completed} steps`),
    errorSummary: "Show error reason",
    errorCode: "Error code",
    errorMessage: "Error message",
    errorUnknown: "Not provided",
    status: { running: "Running", completed: "Completed", failed: "Failed" },
  },
};

export function JobProgressPanelPlugin() {
  const localeCode = useAgentUILocaleCode();
  const messages = localeMessages[localeCode] ?? localeMessages["zh-CN"]!;
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const events = usePluginEvents();
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    const current = eventsRef.current;
    if (!current || typeof current.subscribe !== "function") return;
    const unsubscribe = current.subscribe<Record<string, unknown>>(JOB_PROGRESS_EVENT_NAME, (event) => {
      const payload = event ? (event.payload as Record<string, unknown> | undefined) : undefined;
      if (!payload || typeof payload !== "object") return;
      const jobId = payload.job_id;
      if (jobId === undefined || jobId === null || jobId === "") return;
      setJobs((previous) => upsertJob(previous, payload));
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const runningCount = useMemo(() => jobs.filter((job) => resolvePhase(job) === "running").length, [jobs]);

  return (
    <section className="job-progress-panel" aria-label={messages.title}>
      <header className="job-progress-panel__header">
        <h2 className="job-progress-panel__title">{messages.title}</h2>
        {runningCount > 0 ? <span className="job-progress-panel__badge">{messages.active(runningCount)}</span> : null}
      </header>
      {jobs.length === 0 ? (
        <p className="job-progress-panel__empty" role="status">
          {messages.empty}
        </p>
      ) : (
        <ul className="job-progress-panel__list">
          {jobs.map((job) => {
            const phase = resolvePhase(job);
            const percent =
              job.total > 0
                ? Math.min(100, Math.round((job.completed / job.total) * 100))
                : phase === "completed"
                  ? 100
                  : 0;
            const label = job.title || job.jobId;
            return (
              <li className="job-progress-panel__item" data-phase={phase} key={job.jobId}>
                <div className="job-progress-panel__item-head">
                  <span className="job-progress-panel__item-title" title={label}>
                    {label}
                  </span>
                  <span className="job-progress-panel__status" data-phase={phase}>
                    {messages.status[phase]}
                  </span>
                </div>
                <div className="job-progress-panel__meta">
                  <span className="job-progress-panel__counts">{messages.progress(job.completed, job.total)}</span>
                  <span className="job-progress-panel__percent">{percent}%</span>
                </div>
                <div
                  aria-label={label}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={percent}
                  className="job-progress-panel__track"
                  role="progressbar"
                >
                  <div className="job-progress-panel__bar" data-phase={phase} style={{ width: `${percent}%` }} />
                </div>
                {phase === "failed" ? (
                  <details className="job-progress-panel__error">
                    <summary className="job-progress-panel__error-summary">{messages.errorSummary}</summary>
                    <dl className="job-progress-panel__error-detail">
                      <div className="job-progress-panel__error-row">
                        <dt>{messages.errorCode}</dt>
                        <dd>
                          <code>{job.error?.code ?? messages.errorUnknown}</code>
                        </dd>
                      </div>
                      <div className="job-progress-panel__error-row">
                        <dt>{messages.errorMessage}</dt>
                        <dd>{job.error?.message ?? messages.errorUnknown}</dd>
                      </div>
                    </dl>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
