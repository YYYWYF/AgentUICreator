import { useState } from "react";
import type { CreatorQuestionActivity } from "../agent/creatorInterruptTypes.js";

export function CreatorQuestionCard({ activity, onAnswer, onAbandon }: {
  activity: CreatorQuestionActivity;
  onAnswer: (answers: Record<string, string[]>) => void;
  onAbandon: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>(activity.answers ?? {});
  const ready = activity.steps.every(step => {
    const selected = answers[step.id] ?? [];
    return selected.length >= step.minSelections && selected.length <= step.maxSelections;
  });
  const inactive = activity.status !== "pending";

  return <article className="creator-question-card" aria-label="Creator 问题">
    {activity.steps.map(step => <fieldset key={step.id} disabled={inactive}>
      <legend>{step.question}</legend>
      {step.description ? <p>{step.description}</p> : null}
      {step.options.map(option => {
        const checked = (answers[step.id] ?? []).includes(option.id);
        const shown = activity.status === "resolved" ? (activity.answers?.[step.id] ?? []).includes(option.id) : checked;
        if (activity.status === "resolved" && !shown) return null;
        return <label key={option.id} className="creator-question-option">
          {activity.status === "resolved" ? <span aria-hidden="true">✓</span> : activity.status === "stale" ? null : <input
            type={step.selectionMode === "single" ? "radio" : "checkbox"}
            name={`${activity.id}-${step.id}`}
            checked={checked}
            onChange={() => setAnswers(current => {
              const prior = current[step.id] ?? [];
              const selected = step.selectionMode === "single" ? [option.id]
                : checked ? prior.filter(id => id !== option.id) : [...prior, option.id];
              return { ...current, [step.id]: selected };
            })}
          />}
          <span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span>
        </label>;
      })}
    </fieldset>)}
    {activity.status === "pending" ? <><button type="button" disabled={!ready}
      onClick={() => onAnswer(Object.fromEntries(activity.steps.map(step => [step.id, answers[step.id] ?? []])))}>
      确认选择
    </button><button type="button" onClick={onAbandon}>放弃本次任务</button></> : null}
    {activity.status === "submitting" ? <p role="status">正在继续 Creator 任务…</p> : null}
    {activity.status === "stale" ? <p role="alert">这个问题对应的 Agent 执行状态已经失效，请重新发起请求。</p> : null}
  </article>;
}
