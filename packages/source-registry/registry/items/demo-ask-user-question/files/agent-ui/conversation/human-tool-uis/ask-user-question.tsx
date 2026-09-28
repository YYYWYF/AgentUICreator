import { useRef, useState, type FormEvent } from "react";
import type { ConversationToolCallProps } from "@agent-ui/react";
import { useAgentUILocale } from "../../i18n/useAgentUILocale";
import { parseHumanQuestionRequest, parseHumanQuestionResult, type HumanQuestionResult } from "../../../agent-contract/human-tools/ask-user-question";
import "./question-flow.css";

export function AskUserQuestionToolUI(props: ConversationToolCallProps) {
  const labels = useAgentUILocale("humanQuestion");
  const request = parseHumanQuestionRequest(props.args);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const submitted = useRef(false);
  const result = request === undefined ? undefined : parseHumanQuestionResult(props.result, request);

  if (request === undefined) return <p>{labels.unavailable}</p>;
  const canSubmit = request.steps.every(step => {
    const selected = answers[step.id] ?? [];
    return selected.length >= step.minSelections && selected.length <= step.maxSelections;
  });
  const pending = result === undefined && props.status.type === "requires-action" && typeof props.addResult === "function";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending || !canSubmit || submitted.current || request === undefined) return;
    const response: HumanQuestionResult = { answers: Object.fromEntries(request.steps.map(step => [step.id, answers[step.id] ?? []])) };
    submitted.current = true;
    try { props.addResult?.(response); }
    catch { submitted.current = false; }
  }

  return <form className="agent-ui-question-flow" onSubmit={submit} aria-label={request.steps.map(step => step.question).join(" · ")}>
    {request.steps.map(step => <fieldset key={step.id} disabled={!pending}>
      <legend>{step.question}</legend>
      {step.description ? <p>{step.description}</p> : null}
      {step.options.flatMap(option => {
        const chosen = (result?.answers[step.id] ?? []).includes(option.id);
        if (result !== undefined && !chosen) return [];
        const checked = (answers[step.id] ?? []).includes(option.id);
        return [<label key={option.id} className="agent-ui-question-flow-option">
          {result !== undefined ? <span aria-hidden="true">✓</span> : <input
            type={step.selectionMode === "single" ? "radio" : "checkbox"}
            name={`${props.toolCallId}-${step.id}`}
            checked={checked}
            onChange={() => setAnswers(current => {
              const prior = current[step.id] ?? [];
              return { ...current, [step.id]: step.selectionMode === "single" ? [option.id]
                : checked ? prior.filter(id => id !== option.id) : [...prior, option.id] };
            })}
          />}
          <span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span>
        </label>];
      })}
    </fieldset>)}
    {result !== undefined ? <span className="agent-ui-question-flow-receipt">✓ {labels.answered}</span> : null}
    {pending ? <button type="submit" disabled={!canSubmit || submitted.current}>{submitted.current ? labels.submitting : labels.submit}</button> : null}
    {result === undefined && !pending && props.status.type === "requires-action" ? <p role="alert">{labels.unavailable}</p> : null}
  </form>;
}
