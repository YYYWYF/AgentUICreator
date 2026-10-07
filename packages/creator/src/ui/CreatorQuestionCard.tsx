import { useAgentUILocale, DEFAULT_CREATOR_MESSAGES, type CreatorLocaleMessages, formatLocaleMessage } from "./i18n/locale.js";
import { useState } from "react";
import type { CreatorQuestionActivity } from "../agent/creatorInterruptTypes.js";
import { Button } from "./components/button.js";
import { Check, CircleHelp } from "lucide-react";

export function CreatorQuestionCard({ activity, onAnswer, onAbandon }: {
  activity: CreatorQuestionActivity;
  onAnswer: (answers: Record<string, string[]>) => void;
  onAbandon: () => void;
}) {
  const localeMessages = useAgentUILocale();
  const [answers, setAnswers] = useState<Record<string, string[]>>(activity.answers ?? {});
  const ready = activity.steps.every(step => {
    const selected = answers[step.id] ?? [];
    return selected.length >= step.minSelections && selected.length <= step.maxSelections;
  });
  const inactive = activity.status !== "pending";

  return <article className="creator-question-card creator-ui-scope" aria-label={localeMessages.creatorQuestion.creatorQuestion} data-status={activity.status}>
    <header className="creator-question-header"><CircleHelp aria-hidden="true" /><span>{activity.status === "resolved" ? localeMessages.creatorQuestion.selectionConfirmed : activity.status === "stale" ? localeMessages.creatorQuestion.thisQuestionHasExpired : localeMessages.creatorQuestion.yourSelectionIsNeeded}</span></header>
    {activity.steps.map(step => <fieldset key={step.id} disabled={inactive}>
      <legend>{step.question}</legend>
      {step.description ? <p>{step.description}</p> : null}
      {activity.status === "pending" ? <small className="creator-question-selection-hint">{step.selectionMode === "single" ? localeMessages.creatorQuestion.chooseOne : formatLocaleMessage(localeMessages.creatorQuestion.chooseItems, step.minSelections, step.maxSelections)}</small> : null}
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

      {localeMessages.creatorQuestion.confirmSelection}
    </Button><Button size="sm" variant="ghost" type="button" onClick={onAbandon}>{localeMessages.creatorQuestion.abandonThisTask}</Button></div> : null}
    {activity.status === "submitting" ? <p role="status">{localeMessages.creatorQuestion.continuingCreatorTask}</p> : null}
    {activity.status === "stale" ? <p role="alert">{localeMessages.creatorQuestion.thisQuestionSAgentExecutionHasExpiredStart}</p> : null}
  </article>;
}
