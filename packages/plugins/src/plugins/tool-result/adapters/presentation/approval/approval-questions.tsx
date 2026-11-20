'use client';

import { useState } from 'react';
import {
  useLocale,
  Textarea,
  cn,
  type ToolApprovalQuestion,
  type ToolApprovalAnswer,
} from '../../../../../plugin-support.js';
import { questionAcceptsText, type ToolFallbackApprovalAppearance } from './approval-model.js';
import { ApprovalActionButton, ApprovalActions, pressable } from './approval-actions.js';

export function ToolFallbackApprovalQuestions({
  questions,
  dismissible,
  locked,
  onSend,
  onDismiss,
  ...appearance
}: {
  questions: readonly ToolApprovalQuestion[];
  dismissible: boolean;
  locked: boolean;
  onSend: (answers: Record<string, ToolApprovalAnswer>) => void;
  onDismiss: () => void;
} & ToolFallbackApprovalAppearance) {
  const messages = useLocale('toolPresentation');
  const [selected, setSelected] = useState<ReadonlyMap<string, readonly string[]>>(() => new Map());
  const [typed, setTyped] = useState<ReadonlyMap<string, string>>(() => new Map());

  const toggle = (question: ToolApprovalQuestion, optionId: string) =>
    setSelected((current) => {
      const chosen = current.get(question.id) ?? [];
      const next = chosen.includes(optionId)
        ? chosen.filter((id) => id !== optionId)
        : question.multiple
          ? [...chosen, optionId]
          : [optionId];
      return new Map(current).set(question.id, next);
    });

  const answerOf = (question: ToolApprovalQuestion): ToolApprovalAnswer => {
    const optionIds = selected.get(question.id) ?? [];
    const draft = typed.get(question.id);
    const text = draft?.trim() ? draft : undefined;
    return {
      ...(optionIds.length > 0 && { optionIds }),
      ...(text !== undefined && { text }),
    };
  };

  const complete =
    questions.length > 0 &&
    questions.every((question) => {
      const answer = answerOf(question);
      return answer.optionIds !== undefined || answer.text !== undefined;
    });

  const send = () => {
    if (locked || !complete) {
      return;
    }
    onSend(Object.fromEntries(questions.map((question) => [question.id, answerOf(question)])));
  };

  return (
    <>
      {questions.map((question) => {
        const chosen = selected.get(question.id) ?? [];
        const described = question.options?.some((option) => option.description) ?? false;
        return (
          <div
            key={question.id}
            role='group'
            aria-label={question.prompt}
            data-slot='tool-fallback-approval-question'
            className='aui-tool-fallback-approval-question flex flex-col gap-2'
          >
            <p className='aui-tool-fallback-approval-question-prompt text-foreground whitespace-pre-line'>
              {question.header ? (
                <span data-agent-ui-owned='' className='text-muted-foreground me-1.5 text-xs font-medium uppercase'>
                  {question.header}
                </span>
              ) : null}
              {question.prompt}
            </p>
            {question.options && question.options.length > 0 ? (
              <div
                data-agent-ui-owned=''
                className={cn('flex gap-2', described ? 'flex-col items-stretch' : 'flex-wrap items-center')}
              >
                {question.options.map((option) => {
                  const pressed = chosen.includes(option.id);
                  return (
                    <ApprovalActionButton
                      {...appearance}
                      key={option.id}
                      size='sm'
                      variant={pressed ? 'default' : 'outline'}
                      className={cn(
                        pressable,
                        described && 'h-auto flex-col items-start gap-0.5 py-2 text-start whitespace-normal',
                      )}
                      aria-pressed={pressed}
                      onClick={() => toggle(question, option.id)}
                      disabled={locked}
                    >
                      <span data-agent-ui-owned=''>{option.label}</span>
                      {option.description ? (
                        <span data-agent-ui-owned='' className='text-xs font-normal opacity-80'>
                          {option.description}
                        </span>
                      ) : null}
                    </ApprovalActionButton>
                  );
                })}
              </div>
            ) : null}
            {questionAcceptsText(question) ? (
              <Textarea
                value={typed.get(question.id) ?? ''}
                onChange={(event) => setTyped((current) => new Map(current).set(question.id, event.target.value))}
                disabled={locked}
                aria-label={question.prompt}
                placeholder={
                  question.options?.length ? messages.alternativeAnswerPlaceholder : messages.answerPlaceholder
                }
              />
            ) : null}
          </div>
        );
      })}
      <ApprovalActions {...appearance} className='flex items-center gap-2'>
        <ApprovalActionButton
          {...appearance}
          size='sm'
          className={pressable}
          onClick={send}
          disabled={locked || !complete}
        >
          {messages.send}
        </ApprovalActionButton>
        {dismissible ? (
          <ApprovalActionButton
            {...appearance}
            size='sm'
            variant='outline'
            className={pressable}
            onClick={onDismiss}
            disabled={locked}
          >
            {messages.dismiss}
          </ApprovalActionButton>
        ) : null}
      </ApprovalActions>
    </>
  );
}
