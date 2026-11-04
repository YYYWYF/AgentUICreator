import { useEffect, useState } from "react";
import { useAgentUILocaleCode, usePluginEvents } from "@za38.03/agent-ui-plugins";

import { getJobProgressMessages, type JobProgressMessages } from "./messages";
import {
  JOB_PROGRESS_EVENT_NAME,
  parseJobProgress,
  type JobProgressEntry,
} from "./schema";
import "./styles.css";

function upsertJob(previous: JobProgressEntry[], update: JobProgressEntry): JobProgressEntry[] {
  const index = previous.findIndex((job) => job.job_id === update.job_id);
  if (index < 0) return [...previous, update];
  const next = previous.slice();
  next[index] = update;
  return next;
}

function statusLabel(job: JobProgressEntry, messages: JobProgressMessages): string {
  if (job.phase === "completed") return messages.statusCompleted;
  if (job.phase === "failed") return messages.statusFailed;
  return messages.statusRunning;
}

function percentOf(job: JobProgressEntry): number {
  if (job.phase === "completed") return 100;
  if (job.total <= 0) return 0;
  return Math.min(100, Math.round((job.completed / job.total) * 100));
}

function JobRow({ job, messages }: { job: JobProgressEntry; messages: JobProgressMessages }) {
  const label = statusLabel(job, messages);
  const percent = percentOf(job);
  const valueMax = job.total > 0 ? job.total : 100;
  const valueNow = job.total > 0 ? Math.min(job.completed, job.total) : 0;

  return (
    <li className="job-progress__item" data-phase={job.phase}>
      <div className="job-progress__item-head">
        <span className="job-progress__item-title">{job.title}</span>
        <span className="job-progress__status">{label}</span>
      </div>
      <div
        className="job-progress__meter"
        role="progressbar"
        aria-label={`${job.title} ${label}`}
        aria-valuemin={0}
        aria-valuemax={valueMax}
        aria-valuenow={valueNow}
        aria-valuetext={`${valueNow} / ${valueMax}`}
      >
        <div className="job-progress__meter-fill" data-phase={job.phase} style={{ width: `${percent}%` }} />
      </div>
      <div className="job-progress__meta">
        <span className="job-progress__fraction">
          {job.completed} / {job.total}
        </span>
        <span className="job-progress__job-id">{job.job_id}</span>
      </div>
      {job.phase === "failed" ? (
        job.error ? (
          <details className="job-progress__error">
            <summary className="job-progress__error-summary">{messages.errorToggle}</summary>
            <div className="job-progress__error-body">
              <p className="job-progress__error-message">{job.error.message}</p>
              <p className="job-progress__error-code">
                {messages.errorCodeLabel}: {job.error.code}
              </p>
            </div>
          </details>
        ) : (
          <p className="job-progress__error-missing">{messages.errorMissing}</p>
        )
      ) : null}
    </li>
  );
}

export function JobProgressPanelPlugin() {
  const events = usePluginEvents();
  const localeCode = useAgentUILocaleCode();
  const messages = getJobProgressMessages(localeCode);
  const [jobs, setJobs] = useState<JobProgressEntry[]>([]);

  useEffect(
    () =>
      events.subscribe(JOB_PROGRESS_EVENT_NAME, (event) => {
        const update = parseJobProgress(event.payload);
        if (!update) return;
        setJobs((previous) => upsertJob(previous, update));
      }),
    [events],
  );

  const runningCount = jobs.filter((job) => job.phase === "running").length;

  return (
    <section className="job-progress" aria-label={messages.panelLabel}>
      <div className="job-progress__header">
        <h2 className="job-progress__title">{messages.title}</h2>
        {runningCount > 0 ? (
          <span className="job-progress__summary">
            {messages.runningSummary} {runningCount}
          </span>
        ) : null}
      </div>
      {jobs.length === 0 ? (
        <p className="job-progress__empty">{messages.empty}</p>
      ) : (
        <ul className="job-progress__list">
          {jobs.map((job) => (
            <JobRow key={job.job_id} job={job} messages={messages} />
          ))}
        </ul>
      )}
    </section>
  );
}
