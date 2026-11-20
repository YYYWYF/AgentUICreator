'use client';

import { useLocale, type ToolApprovalOption } from '../../../../../plugin-support.js';
import {
  isAllowKind,
  isKnownKind,
  approvalOptionLabel,
  type ToolFallbackApprovalAppearance,
} from './approval-model.js';
import { ApprovalActionButton, ApprovalActions, optionAction, pressable } from './approval-actions.js';

export function ApprovalConfirmation({
  confirming,
  locked,
  onConfirm,
  onBack,
  ...appearance
}: {
  confirming: ToolApprovalOption;
  locked: boolean;
  onConfirm: () => void;
  onBack: () => void;
} & ToolFallbackApprovalAppearance) {
  const messages = useLocale('toolPresentation');
  const confirmMeta = typeof confirming.confirm === 'object' ? confirming.confirm : undefined;
  const confirmDescription = confirmMeta?.description ?? confirming.description;
  return (
    <>
      <p className='aui-tool-fallback-approval-confirm-title font-semibold'>
        {confirmMeta?.title ?? `${approvalOptionLabel(confirming, messages)}?`}
      </p>
      {confirmDescription && (
        <p className='aui-tool-fallback-approval-confirm-description text-muted-foreground whitespace-pre-line'>
          {confirmDescription}
        </p>
      )}
      {confirming.grants && confirming.grants.length > 0 && (
        <ul className='aui-tool-fallback-approval-confirm-grants flex flex-col gap-1'>
          {confirming.grants.map((grant) => (
            <li data-agent-ui-owned='' key={grant}>
              <code className='aui-tool-fallback-approval-confirm-grant bg-muted rounded px-1.5 py-0.5 text-xs'>
                {grant}
              </code>
            </li>
          ))}
        </ul>
      )}
      <ApprovalActions {...appearance} className='flex items-center gap-2'>
        <ApprovalActionButton
          {...appearance}
          action={optionAction(confirming)}
          size='sm'
          className={pressable}
          onClick={() => onConfirm()}
          disabled={locked}
        >
          {messages.confirm}
        </ApprovalActionButton>
        <ApprovalActionButton
          {...appearance}
          size='sm'
          variant='outline'
          className={pressable}
          onClick={() => {
            onBack();
          }}
          disabled={locked}
        >
          {messages.back}
        </ApprovalActionButton>
      </ApprovalActions>
    </>
  );
}

export function ApprovalOptionButtons({
  options,
  locked,
  question,
  acceptsText,
  onOption,
  onReject,
  dismissButton,
  ...appearance
}: {
  options: readonly ToolApprovalOption[];
  locked: boolean;
  question: boolean;
  acceptsText: boolean;
  onOption: (option: ToolApprovalOption) => void;
  onReject: () => void;
  dismissButton: React.ReactNode;
} & ToolFallbackApprovalAppearance) {
  const messages = useLocale('toolPresentation');
  const allowOptions = options.filter((option) => isAllowKind(option.kind));
  const customOptions = options.filter((option) => !isKnownKind(option.kind));
  const rejectOptions = options.filter((option) => isKnownKind(option.kind) && !isAllowKind(option.kind));
  return (
    <ApprovalActions {...appearance} className='flex flex-wrap items-center gap-2'>
      {[...allowOptions, ...customOptions, ...rejectOptions].map((option) => (
        <ApprovalActionButton
          {...appearance}
          action={optionAction(option)}
          key={option.id}
          size='sm'
          variant={option === allowOptions[0] ? 'default' : 'outline'}
          className={pressable}
          onClick={() => onOption(option)}
          disabled={locked}
        >
          {approvalOptionLabel(option, messages)}
        </ApprovalActionButton>
      ))}
      {rejectOptions.length === 0 && !question && (
        <ApprovalActionButton
          {...appearance}
          action='reject'
          size='sm'
          variant='outline'
          className={pressable}
          onClick={() => onReject()}
          disabled={locked}
        >
          {messages.deny}
        </ApprovalActionButton>
      )}
      {!acceptsText && dismissButton}
    </ApprovalActions>
  );
}
