import { useRef, useState } from 'react';
import {
  ConversationOptionList,
  ConversationQuestionFlow,
  type ConversationQuestionFlowLabels,
} from '../../../../public.js';
import type { HumanQuestionStep } from './contract.js';

/** Text and mixed questionnaires use the same answer envelope as option questions. */
export function HumanQuestionFlow({
  steps,
  choice,
  labels,
  onComplete,
}: {
  steps: readonly HumanQuestionStep[];
  choice?: Readonly<Record<string, readonly string[]>> | undefined;
  labels: ConversationQuestionFlowLabels & { unavailable: string };
  onComplete?: ((answers: Record<string, string[]>) => void | Promise<void>) | undefined;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  if (choice !== undefined || !onComplete) {
    return (
      <div data-agent-ui-owned=''>
        {steps.map((step) =>
          step.selectionMode === 'text' ? (
            <section data-agent-ui-owned='' key={step.id}>
              <h4 data-agent-ui-owned=''>{step.question}</h4>
              <p data-agent-ui-owned='' style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                {choice?.[step.id]?.[0]}
              </p>
            </section>
          ) : (
            <ConversationQuestionFlow
              key={step.id}
              steps={[{ ...step, selectionMode: step.selectionMode }]}
              choice={choice}
              labels={labels}
            />
          ),
        )}
      </div>
    );
  }
  const step = steps[index]!;
  const submit = async (selected: string[]) => {
    if (submitting.current || selected.length < step.minSelections || selected.length > step.maxSelections) {
      return;
    }
    if (step.selectionMode === 'text' && selected.some((value) => !value.trim() || value.length > 4000)) {
      return;
    }
    setFailed(false);
    const next = { ...answers, [step.id]: selected };
    if (index < steps.length - 1) {
      setAnswers(next);
      setText(next[steps[index + 1]!.id]?.[0] ?? '');
      setIndex(index + 1);
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      await onComplete(next);
    } catch (error) {
      submitting.current = false;
      setBusy(false);
      throw new Error(labels.unavailable, { cause: error });
    }
  };
  const confirmLabel = busy ? labels.submitting : index < steps.length - 1 ? labels.next : labels.submit;
  return (
    <section data-agent-ui-owned='' className='flex min-w-0 w-full max-w-sm flex-col gap-2' aria-label={step.question}>
      <span data-agent-ui-owned='' className='text-xs text-foreground/60 tabular-nums'>
        {index + 1} / {steps.length}
      </span>
      <div
        data-agent-ui-owned=''
        role='progressbar'
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={index + 1}
        className='h-1 w-full rounded-full bg-foreground/10'
      >
        <div
          data-agent-ui-owned=''
          className='h-full rounded-full bg-foreground/60'
          style={{ width: `${((index + 1) / steps.length) * 100}%` }}
        />
      </div>
      {step.selectionMode === 'text' ? (
        <form
          data-agent-ui-owned=''
          onSubmit={(event) => {
            event.preventDefault();
            void submit(text.trim() ? [text] : []).catch(() => setFailed(true));
          }}
        >
          <label data-agent-ui-owned='' className='flex min-w-0 flex-col gap-2'>
            {step.question}
            <textarea
              data-agent-ui-owned=''
              value={text}
              maxLength={4000}
              required={step.minSelections > 0}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <button data-agent-ui-owned='' type='submit' disabled={busy || (step.minSelections > 0 && !text.trim())}>
            {confirmLabel}
          </button>
        </form>
      ) : (
        <>
          <h4 data-agent-ui-owned='' className='text-sm font-medium break-words'>
            {step.question}
          </h4>
          <ConversationOptionList
            key={`${step.id}:${index}`}
            options={step.options}
            selectionMode={step.selectionMode}
            {...(answers[step.id] === undefined ? {} : { defaultValue: answers[step.id] })}
            minSelections={step.minSelections}
            maxSelections={step.maxSelections}
            confirmLabel={confirmLabel}
            onConfirm={submit}
          />
          {step.selectionMode === 'single' && step.minSelections === 0 ? (
            <button
              data-agent-ui-owned=''
              type='button'
              disabled={busy}
              onClick={() => {
                void submit([]).catch(() => setFailed(true));
              }}
            >
              {confirmLabel}
            </button>
          ) : null}
        </>
      )}
      {step.description ? <p data-agent-ui-owned=''>{step.description}</p> : null}
      {failed ? (
        <p data-agent-ui-owned='' role='alert'>
          {labels.unavailable}
        </p>
      ) : null}
      {index > 0 ? (
        <button
          data-agent-ui-owned=''
          type='button'
          disabled={busy}
          onClick={() => {
            if (step.selectionMode === 'text') {
              setAnswers((current) => ({ ...current, [step.id]: text.trim() ? [text] : [] }));
            }
            setText(answers[steps[index - 1]!.id]?.[0] ?? '');
            setFailed(false);
            setIndex(index - 1);
          }}
        >
          {labels.back}
        </button>
      ) : null}
    </section>
  );
}
