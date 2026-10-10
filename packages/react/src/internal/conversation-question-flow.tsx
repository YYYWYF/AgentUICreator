import { useEffect, useRef, useState, type ReactElement } from "react";
import { useAuiState } from "@assistant-ui/react";
import { OptionList } from "./vendor/assistant-ui/components/assistant-ui/elements/option-list.js";

export interface ConversationOption {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface ConversationOptionListProps {
  options: readonly ConversationOption[];
  selectionMode?: "single" | "multiple";
  defaultValue?: readonly string[];
  minSelections?: number;
  maxSelections?: number;
  onConfirm?: (ids: string[]) => void | Promise<void>;
  confirmLabel?: string;
}

export function ConversationOptionList(props: ConversationOptionListProps): ReactElement {
  return <OptionList {...props} />;
}

export function useConversationCanAnswerToolCall(): boolean {
  return useAuiState((state) => state.thread.capabilities.answerToolCall);
}

export interface ConversationQuestionStep {
  id: string;
  question: string;
  description?: string;
  options: readonly ConversationOption[];
  selectionMode: "single" | "multiple";
  minSelections: number;
  maxSelections: number;
}

export interface ConversationQuestionFlowLabels {
  back: string;
  next: string;
  submit: string;
  submitting: string;
  answered: string;
  noneSelected: string;
}

export interface ConversationQuestionFlowProps {
  steps: readonly ConversationQuestionStep[];
  choice?: Readonly<Record<string, readonly string[]>> | undefined;
  onComplete?: ((answers: Record<string, string[]>) => void | Promise<void>) | undefined;
  labels: ConversationQuestionFlowLabels;
}

export function ConversationQuestionFlow({ steps, choice, onComplete, labels }: ConversationQuestionFlowProps): ReactElement | null {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const completingRef = useRef(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const receiptResolveRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (choice !== undefined) {
      receiptResolveRef.current?.();
      receiptResolveRef.current = null;
    }
  }, [choice]);
  if (steps.length === 0) return null;

  if (choice !== undefined) {
    return <div data-agent-ui-owned="" className="flex min-w-0 w-full max-w-sm flex-col gap-3" data-state="receipt">
      {steps.map(step => <section data-agent-ui-owned="" key={step.id} className="min-w-0">
        <h4 data-agent-ui-owned="" className="text-sm font-medium break-words">{step.question}</h4>
        {step.options.filter(option => choice[step.id]?.includes(option.id)).map(option =>
          <div data-agent-ui-owned="" key={option.id} className="text-sm break-words">✓ {option.label}</div>)}
        {choice[step.id]?.length === 0 ? <span data-agent-ui-owned="" className="text-xs text-foreground/60">{labels.noneSelected}</span> : null}
      </section>)}
    </div>;
  }

  if (!onComplete) {
    return <div data-agent-ui-owned="" className="flex min-w-0 w-full max-w-sm flex-col gap-4" data-state="readonly">
      {steps.map(step => <section data-agent-ui-owned="" key={step.id} className="flex min-w-0 flex-col gap-2">
        <h4 data-agent-ui-owned="" className="text-sm font-medium break-words">{step.question}</h4>
        {step.description ? <p data-agent-ui-owned="" className="text-xs text-foreground/60 break-words">{step.description}</p> : null}
        <ConversationOptionList options={step.options} selectionMode={step.selectionMode} />
      </section>)}
    </div>;
  }

  const step = steps[Math.min(stepIndex, steps.length - 1)]!;
  const confirm = async (ids: string[]) => {
    const nextAnswers = { ...answers, [step.id]: ids };
    if (stepIndex < steps.length - 1) {
      setAnswers(nextAnswers);
      setStepIndex(stepIndex + 1);
      return;
    }
    if (completingRef.current) return;
    completingRef.current = true;
    setIsCompleting(true);
    try {
      await onComplete(Object.fromEntries(steps.map(item => [item.id, nextAnswers[item.id] ?? []])));
      await new Promise<void>(resolve => { receiptResolveRef.current = resolve; });
    } catch (error) {
      completingRef.current = false;
      setIsCompleting(false);
      throw error;
    }
  };

  return <section data-agent-ui-owned="" className="flex min-w-0 w-full max-w-sm flex-col gap-2" aria-label={step.question}>
    <span data-agent-ui-owned="" className="text-xs text-foreground/60 tabular-nums">{stepIndex + 1} / {steps.length}</span>
    <div data-agent-ui-owned="" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={stepIndex + 1}
      className="h-1 w-full rounded-full bg-foreground/10">
      <div data-agent-ui-owned="" className="h-full rounded-full bg-foreground/60" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
    </div>
    <h4 data-agent-ui-owned="" className="text-sm font-medium break-words">{step.question}</h4>
    {step.description ? <p data-agent-ui-owned="" className="text-xs text-foreground/60 break-words">{step.description}</p> : null}
    <ConversationOptionList key={`${step.id}:${stepIndex}`} options={step.options} selectionMode={step.selectionMode}
      {...(answers[step.id] === undefined ? {} : { defaultValue: answers[step.id] })}
      minSelections={step.minSelections} maxSelections={step.maxSelections}
      confirmLabel={isCompleting ? labels.submitting : stepIndex === steps.length - 1 ? labels.submit : labels.next}
      onConfirm={confirm} />
    {isCompleting ? <span data-agent-ui-owned="" role="status" className="text-xs text-foreground/60">{labels.submitting}</span> : null}
    {step.selectionMode === "single" && step.minSelections === 0 ?
      <button data-agent-ui-owned="" type="button" className="self-start text-xs text-foreground/60 hover:text-foreground"
        disabled={isCompleting} onClick={() => { void confirm([]); }}>{isCompleting ? labels.submitting : stepIndex === steps.length - 1 ? labels.submit : labels.next}</button> : null}
    {stepIndex > 0 ? <button data-agent-ui-owned="" type="button" className="self-start text-xs text-foreground/60 hover:text-foreground"
      disabled={isCompleting} onClick={() => setStepIndex(stepIndex - 1)}>{labels.back}</button> : null}
  </section>;
}
