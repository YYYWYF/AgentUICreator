import { useAgentUILocaleCode, usePluginEvents } from "@za38.03/agent-ui-plugins";
import { useEffect, useMemo, useState } from "react";
import "./styles.css";

type JobError = { code?: string; message?: string } | null;

/** Business payload carried by the live `app.job.progress` application event. */
type JobProgressEventPayload = {
  job_id?: string;
  title?: string;
  status?: string;
  completed?: number;
  total?: number;
  error?: JobError;
};

type JobProgress = {
  jobId: string;
  title: string;
  status: string;
  completed: number;
  total: number;
  error: JobError;
};

type StatusKind = "pending" | "running" | "completed" | "failed" | "cancelled";

type Messages = {
  title: string;
  summary: (active: number, all: number) => string;
  emptyTitle: string;
  emptyHint: string;
  steps: (completed: number, total: number) => string;
  unbounded: string;
  status: Record<StatusKind, string>;
  errorToggle: string;
  errorCode: string;
  errorMessage: string;
};

const messages: Record<string, Messages> = {
  "zh-CN": {
    title: "任务进度",
    summary: (active, all) => (active > 0 ? `${active} 个进行中 / 共 ${all} 个` : `共 ${all} 个任务`),
    emptyTitle: "暂无任务",
    emptyHint: "Agent 汇报任务进度后，这里会按任务实时更新。",
    steps: (completed, total) => `${completed} / ${total} 步`,
    unbounded: "进度暂未提供",
    status: {
      pending: "等待中",
      running: "进行中",
      completed: "已完成",
      failed: "失败",
      cancelled: "已取消",
    },
    errorToggle: "查看错误原因",
    errorCode: "错误码",
    errorMessage: "错误原因",
  },
  "en-US": {
    title: "Job progress",
    summary: (active, all) => (active > 0 ? `${active} running of ${all}` : `${all} jobs`),
    emptyTitle: "No jobs yet",
    emptyHint: "Jobs appear here and update in place once the Agent reports progress.",
    steps: (completed, total) => `${completed} / ${total} steps`,
    unbounded: "Progress unavailable",
    status: {
      pending: "Pending",
      running: "Running",
      completed: "Completed",
      failed: "Failed",
      cancelled: "Cancelled",
    },
    errorToggle: "Show error details",
    errorCode: "Code",
    errorMessage: "Reason",
  },
};

const STATUS_ALIASES: Record<string, StatusKind> = {
  pending: "pending",
  queued: "pending",
  waiting: "pending",
  created: "pending",
  scheduled: "pending",
  running: "running",
  in_progress: "running",
  processing: "running",
  started: "running",
  active: "running",
  completed: "completed",
  complete: "completed",
  succeeded: "completed",
  success: "completed",
  done: "completed",
  finished: "completed",
  failed: "failed",
  failure: "failed",
  error: "failed",
  errored: "failed",
  cancelled: "cancelled",
  canceled: "cancelled",
  aborted: "cancelled",
};

function normalizeStatus(status: string | undefined): StatusKind {
  if (!status) return "running";
  return STATUS_ALIASES[status.trim().toLowerCase()] ?? "running";
}

function normalizeNumber(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, value);
}

function normalizeError(error: JobError | undefined): JobError {
  if (!error) return null;
  const code = typeof error.code === "string" && error.code.trim() ? error.code.trim() : undefined;
  const message = typeof error.message === "string" && error.message.trim() ? error.message.trim() : undefined;
  if (!code && !message) return null;
  return { ...(code ? { code } : {}), ...(message ? { message } : {}) };
}

function progressPercent(job: JobProgress): number {
  if (job.total > 0) {
    return Math.min(100, Math.max(0, Math.round((job.completed / job.total) * 100)));
  }
  return normalizeStatus(job.status) === "completed" ? 100 : 0;
}

export function JobProgressPanelPlugin() {
  const events = usePluginEvents();
  const localeCode = useAgentUILocaleCode();
  const text = messages[localeCode] ?? messages["zh-CN"]!;
  const [jobs, setJobs] = useState<JobProgress[]>([]);

  useEffect(
    () =>
      events.subscribe<JobProgressEventPayload>("app.job.progress", (event) => {
        const payload = event?.payload;
        const jobId = typeof payload?.job_id === "string" ? payload.job_id.trim() : "";
        if (!jobId) return;
        const hasErrorKey = Object.prototype.hasOwnProperty.call(payload, "error");

        setJobs((previous) => {
          const index = previous.findIndex((job) => job.jobId === jobId);
          const base: JobProgress =
            index >= 0
              ? previous[index]!
              : { jobId, title: jobId, status: "running", completed: 0, total: 0, error: null };

          const title =
            typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : base.title;
          const status =
            typeof payload.status === "string" && payload.status.trim() ? payload.status.trim() : base.status;

          const next: JobProgress = {
            ...base,
            title,
            status,
            completed: normalizeNumber(payload.completed, base.completed),
            total: normalizeNumber(payload.total, base.total),
            error: hasErrorKey ? normalizeError(payload.error) : base.error,
          };

          if (index < 0) return [...previous, next];
          const copy = previous.slice();
          copy[index] = next;
          return copy;
        });
      }),
    [events],
  );

  const activeCount = useMemo(
    () => jobs.filter((job) => normalizeStatus(job.status) === "running").length,
    [jobs],
  );

  return (
    <aside className="job-progress-panel" aria-label={text.title}>
      <header className="job-progress-panel__header">
        <h2 className="job-progress-panel__title">{text.title}</h2>
        {jobs.length > 0 ? (
          <span className="job-progress-panel__summary" aria-live="polite">
            {text.summary(activeCount, jobs.length)}
          </span>
        ) : null}
      </header>
      {jobs.length === 0 ? (
        <div className="job-progress-panel__empty">
          <p className="job-progress-panel__empty-title">{text.emptyTitle}</p>
          <p className="job-progress-panel__empty-hint">{text.emptyHint}</p>
        </div>
      ) : (
        <ul className="job-progress-panel__list">
          {jobs.map((job) => (
            <JobProgressItem key={job.jobId} job={job} text={text} />
          ))}
        </ul>
      )}
    </aside>
  );
}

function JobProgressItem({ job, text }: { job: JobProgress; text: Messages }) {
  const kind = normalizeStatus(job.status);
  const percent = progressPercent(job);
  const indeterminate = kind === "running" && job.total <= 0;
  const errorCode = job.error?.code;
  const errorMessage = job.error?.message;
  const hasError = Boolean(errorCode || errorMessage);

  return (
    <li className="job-progress-panel__item" data-status={kind}>
      <div className="job-progress-panel__item-head">
        <span className="job-progress-panel__job-title" title={job.title}>
          {job.title}
        </span>
        <span className="job-progress-panel__badge">{text.status[kind]}</span>
      </div>
      <div
        className={`job-progress-panel__bar${indeterminate ? " job-progress-panel__bar--indeterminate" : ""}`}
        role="progressbar"
        aria-label={job.title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : percent}
      >
        <span
          className="job-progress-panel__bar-fill"
          style={{ width: indeterminate ? "35%" : `${percent}%` }}
        />
      </div>
      <div className="job-progress-panel__meta">
        <span>{job.total > 0 ? text.steps(job.completed, job.total) : text.unbounded}</span>
        <span>{indeterminate ? text.status.running : `${percent}%`}</span>
      </div>
      {hasError ? (
        <details className="job-progress-panel__error">
          <summary className="job-progress-panel__error-summary">{text.errorToggle}</summary>
          <dl className="job-progress-panel__error-body">
            {errorCode ? (
              <>
                <dt>{text.errorCode}</dt>
                <dd>{errorCode}</dd>
              </>
            ) : null}
            {errorMessage ? (
              <>
                <dt>{text.errorMessage}</dt>
                <dd>{errorMessage}</dd>
              </>
            ) : null}
          </dl>
        </details>
      ) : null}
    </li>
  );
}
