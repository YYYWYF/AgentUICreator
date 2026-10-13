import { useRef, useState } from "react";
import { ConversationQuestionFlow, type ConversationQuestionFlowLabels } from "@agent-ui/react";
import type { HumanQuestionStep } from "../../../agent-contract/human-tools/ask-user-question";

/** Text and mixed questionnaires use the same answer envelope as option questions. */
export function InterruptQuestionFlow({ steps, choice, labels, onComplete }: {
  steps: readonly HumanQuestionStep[];
  choice?: Readonly<Record<string, readonly string[]>> | undefined;
  labels: ConversationQuestionFlowLabels & { unavailable: string };
  onComplete?: ((answers: Record<string, string[]>) => void | Promise<void>) | undefined;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  if (choice !== undefined || !onComplete) return <div data-agent-ui-owned="">
    {steps.map(step => step.selectionMode === "text"
      ? <section data-agent-ui-owned="" key={step.id}><h4 data-agent-ui-owned="">{step.question}</h4>
          <p data-agent-ui-owned="" style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{choice?.[step.id]?.[0]}</p></section>
      : <ConversationQuestionFlow key={step.id} steps={[{ ...step, selectionMode: step.selectionMode }]}
          choice={choice} labels={labels} />)}
  </div>;
  const step = steps[index]!;
  const submit = async (selected: string[]) => {
    if (submitting.current || selected.length < step.minSelections || selected.length > step.maxSelections) return;
    if (step.selectionMode === "text" && selected.some(value => !value.trim() || value.length > 4000)) return;
    setFailed(false);
    const next = { ...answers, [step.id]: selected };
    if (index < steps.length - 1) { setAnswers(next); setText(""); setIndex(index + 1); return; }
    submitting.current = true;
    setBusy(true);
    try { await onComplete(next); }
    finally { submitting.current = false; setBusy(false); }
  };
  if (step.selectionMode !== "text") return <ConversationQuestionFlow key={step.id}
    steps={[{ ...step, selectionMode: step.selectionMode }]} labels={labels}
    onComplete={value => submit(value[step.id] ?? [])} />;
  return <form data-agent-ui-owned="" onSubmit={event => { event.preventDefault(); void submit(text.trim() ? [text] : []).catch(() => setFailed(true)); }}>
    <label data-agent-ui-owned="" className="flex min-w-0 flex-col gap-2">{step.question}
      <textarea data-agent-ui-owned="" value={text} maxLength={4000} required={step.minSelections > 0}
        disabled={busy} onChange={event => setText(event.target.value)} />
    </label>
    {step.description ? <p data-agent-ui-owned="">{step.description}</p> : null}
    {failed ? <p data-agent-ui-owned="" role="alert">{labels.unavailable}</p> : null}
    <button data-agent-ui-owned="" type="submit" disabled={busy || (step.minSelections > 0 && !text.trim())}>
      {busy ? labels.submitting : index < steps.length - 1 ? labels.next : labels.submit}
    </button>
  </form>;
}
