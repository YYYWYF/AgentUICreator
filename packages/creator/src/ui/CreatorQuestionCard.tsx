import { useState } from "react";
import type { CreatorQuestionActivity } from "../agent/creatorInterruptTypes.js";
import { Button } from "./components/button.js";
import { Check, CircleHelp } from "lucide-react";

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

  return <article className="creator-question-card creator-ui-scope" aria-label="Creator 问题" data-status={activity.status}>
    <header className="creator-question-header"><CircleHelp aria-hidden="true" /><span>{activity.status === "resolved" ? "已确认选择" : activity.status === "stale" ? "此问题已失效" : "需要你的选择"}</span></header>
    {activity.steps.map(step => <fieldset key={step.id} disabled={inactive}>
      <legend>{step.question}</legend>
      {step.description ? <p>{step.description}</p> : null}
      {activity.status === "pending" ? <small className="creator-question-selection-hint">{step.selectionMode === "single" ? "选择一项" : `选择 ${step.minSelections}–${step.maxSelections} 项`}</small> : null}
      {step.options.map(option => {
        const checked = (answers[step.id] ?? []).includes(option.id);
        const shown = activity.status === "resolved" ? (activity.answers?.[step.id] ?? []).includes(option.id) : checked;
        if (activity.status === "resolved" && !shown) return null;
        return <label key={option.id} className="creator-question-option" data-selected={shown}>
          {activity.status === "resolved" ? <Check aria-hidden="true" className="cui:size-4 cui:text-primary" /> : activity.status === "stale" ? null : <input
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
    {activity.status === "pending" ? <div className="creator-question-actions"><Button size="sm" type="button" disabled={!ready}
      onClick={() => onAnswer(Object.fromEntries(activity.steps.map(step => [step.id, answers[step.id] ?? []])))}>
      确认选择
    </Button><Button size="sm" variant="ghost" type="button" onClick={onAbandon}>放弃本次任务</Button></div> : null}
    {activity.status === "submitting" ? <p role="status">正在继续 Creator 任务…</p> : null}
    {activity.status === "stale" ? <p role="alert">这个问题对应的 Agent 执行状态已经失效，请重新发起请求。</p> : null}
  </article>;
}
