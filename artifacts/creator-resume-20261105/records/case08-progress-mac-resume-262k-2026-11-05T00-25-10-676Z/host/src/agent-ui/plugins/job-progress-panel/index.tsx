import { useAgentUILocaleCode, usePluginEvents } from "@za38.03/agent-ui-plugins";
import { useEffect, useId, useState } from "react";
import {
  formatMessage,
  jobProgressPanelMessages,
  type JobProgressPanelMessages,
} from "./messages";
import "./styles.css";

const JOB_PROGRESS_EVENT = "app.job.progress";

type JobError = {
  code?: string;
  message?: string;
};

type JobProgress = {
  jobId: string;
  title?: string;
  status: string;
  completed?: number;
  total?: number;
  error?: JobError | null;
};

function readCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, value);
}

function readError(value: unknown): JobError | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const error: JobError = {};
  if (typeof record.code === "string" && record.code.trim()) {
    error.code = record.code.trim();
  }
  if (typeof record.message === "string" && record.message.trim()) {
    error.message = record.message.trim();
  }
  return error.code || error.message ? error : null;
}

function readJobProgress(value: unknown): JobProgress | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const jobId = typeof record.job_id === "string" ? record.job_id.trim() : "";
  if (!jobId) return null;

  const status =
    typeof record.status === "string" && record.status.trim()
      ? record.status.trim().toLowerCase()
      : "running";
  const job: JobProgress = { jobId, status };
  if (typeof record.title === "string" && record.title.trim()) {
    job.title = record.title.trim();
  }
  const completed = readCount(record.completed);
  if (completed !== undefined) job.completed = completed;
  const total = readCount(record.total);
  if (total !== undefined) job.total = total;
  const error = readError(record.error);
  if (error !== undefined) job.error = error;
  return job;
}

export function JobProgressPanelPlugin() {
  const localeCode = useAgentUILocaleCode();
  const text: JobProgressPanelMessages =
    jobProgressPanelMessages[localeCode] ?? jobProgressPanelMessages["zh-CN"]!;
  const events = usePluginEvents();
  const [jobs, setJobs] = useState<JobProgress[]>([]);
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});
  const baseId = useId();

  useEffect(() => {
    return events.subscribe(JOB_PROGRESS_EVENT, (event) => {
      const incoming = readJobProgress(event.payload);
      if (!incoming) return;
      setJobs((current) => {
        const index = current.findIndex((job) => job.jobId === incoming.jobId);
        if (index < 0) return [...current, incoming];
        const next = current.slice();
        next[index] = { ...next[index], ...incoming };
        return next;
      });
    });
  }, [events]);

  const runningCount = jobs.filter((job) => job.status === "running").length;

  const toggleJobError = (jobId: string) => {
    setExpandedJobs((current) => ({ ...current, [jobId]: !current[jobId] }));
  };

  return (
    <aside className="job-progress-panel" aria-label={text.panelTitle}>
      <header className="job-progress-panel__header">
        <h2 className="job-progress-panel__title">{text.panelTitle}</h2>
        {runningCount > 0 ? (
          <span className="job-progress-panel__count">
            {formatMessage(text.runningCount, { count: runningCount })}
          </span>
        ) : null}
      </header>
      <div className="job-progress-panel__body">
        {jobs.length === 0 ? (
          <p className="job-progress-panel__empty">{text.empty}</p>
        ) : (
          <ol className="job-progress-panel__list">
            {jobs.map((job, index) => {
              const title = job.title ?? job.jobId;
              const statusLabel = text.status[job.status] ?? job.status;
              const total = job.total;
              const completed = job.completed ?? 0;
              const percent =
                typeof total === "number" && total > 0
                  ? Math.min(100, Math.round((completed / total) * 100))
                  : job.status === "completed"
                    ? 100
                    : 0;
              const failed = job.status === "failed";
              const errorId = `${baseId}-error-${index}`;
              const expanded = Boolean(expandedJobs[job.jobId]);

              return (
                <li
                  key={job.jobId}
                  className="job-progress-panel__item"
                  data-status={job.status}
                >
                  <div className="job-progress-panel__item-header">
                    <span className="job-progress-panel__item-title">{title}</span>
                    <span className="job-progress-panel__badge" data-status={job.status}>
                      {statusLabel}
                    </span>
                  </div>
                  {typeof total === "number" ? (
                    <div className="job-progress-panel__progress">
                      <div
                        className="job-progress-panel__track"
                        role="progressbar"
                        aria-label={title}
                        aria-valuemin={0}
                        aria-valuemax={total}
                        aria-valuenow={Math.min(completed, total)}
                      >
                        <div
                          className="job-progress-panel__fill"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="job-progress-panel__progress-text">
                        {completed} / {total}
                      </span>
                    </div>
                  ) : null}
                  {job.status === "completed" ? (
                    <p className="job-progress-panel__state">{text.completedHint}</p>
                  ) : null}
                  {failed ? (
                    <div className="job-progress-panel__error">
                      <button
                        type="button"
                        className="job-progress-panel__error-toggle"
                        aria-expanded={expanded}
                        aria-controls={errorId}
                        onClick={() => toggleJobError(job.jobId)}
                      >
                        <span
                          className="job-progress-panel__error-indicator"
                          aria-hidden="true"
                        >
                          {expanded ? "\u25be" : "\u25b8"}
                        </span>
                        <span>
                          {expanded ? text.hideErrorDetail : text.showErrorDetail}
                        </span>
                      </button>
                      <div
                        className="job-progress-panel__error-body"
                        id={errorId}
                        hidden={!expanded}
                      >
                        {job.error?.code ? (
                          <p className="job-progress-panel__error-line">
                            <span className="job-progress-panel__error-label">
                              {text.errorCodeLabel}
                            </span>
                            <code>{job.error.code}</code>
                          </p>
                        ) : null}
                        <p className="job-progress-panel__error-line">
                          <span className="job-progress-panel__error-label">
                            {text.errorMessageLabel}
                          </span>
                          <span>{job.error?.message ?? text.errorMessageFallback}</span>
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <p className="job-progress-panel__job-id">
                    {text.jobIdLabel} {job.jobId}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </aside>
  );
}
