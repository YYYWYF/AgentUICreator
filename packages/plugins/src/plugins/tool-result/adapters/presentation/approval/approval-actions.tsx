'use client';

import type { ComponentProps } from 'react';
import { Button, cn, useLocale, type ToolApprovalOption } from '../../../../../plugin-support.js';
import { isAllowKind, isKnownKind, type ToolFallbackApprovalAppearance } from './approval-model.js';

export const pressable = 'active:scale-[0.98]';
type ApprovalAction = 'approve' | 'reject';

export function optionAction(option: ToolApprovalOption): ApprovalAction | undefined {
  return isAllowKind(option.kind) ? 'approve' : isKnownKind(option.kind) ? 'reject' : undefined;
}

/** One styling owner for command decisions, native options and binary approvals. */
export function ApprovalActionButton({
  action,
  approvalClassNames,
  approvalStyles,
  className,
  style,
  ...props
}: ComponentProps<typeof Button> &
  ToolFallbackApprovalAppearance & {
    action?: ApprovalAction | undefined;
  }) {
  const part = action === 'approve' ? 'approveButton' : action === 'reject' ? 'rejectButton' : undefined;
  return (
    <Button
      {...props}
      className={cn(pressable, className, approvalClassNames?.button, part && approvalClassNames?.[part])}
      style={{ ...style, ...approvalStyles?.button, ...(part && approvalStyles?.[part]) }}
    />
  );
}

export function ApprovalActions({
  approvalClassNames,
  approvalStyles,
  className,
  style,
  ...props
}: ComponentProps<'div'> & ToolFallbackApprovalAppearance) {
  return (
    <div
      data-agent-ui-owned=''
      {...props}
      className={cn(className, approvalClassNames?.actions)}
      style={{ ...style, ...approvalStyles?.actions }}
    />
  );
}

export function CommandApprovalActions({
  decisions,
  locked,
  onDecision,
  ...appearance
}: ToolFallbackApprovalAppearance & {
  decisions: readonly string[];
  locked: boolean;
  onDecision: (decision: string) => void;
}) {
  const messages = useLocale('toolPresentation');
  return (
    <ApprovalActions {...appearance} className='flex flex-wrap items-center gap-2'>
      {decisions.map((decision, index) => (
        <ApprovalActionButton
          {...appearance}
          key={`${decision}:${index}`}
          action={decision === 'approve' || decision === 'reject' ? decision : undefined}
          size='sm'
          variant='outline'
          onClick={() => onDecision(decision)}
          disabled={locked}
        >
          {decision === 'approve' ? messages.allow : decision === 'reject' ? messages.deny : decision}
        </ApprovalActionButton>
      ))}
    </ApprovalActions>
  );
}

export function ApprovalDecisionActions({
  locked,
  onApprove,
  onReject,
  ...appearance
}: ToolFallbackApprovalAppearance & {
  locked: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const messages = useLocale('toolPresentation');
  return (
    <ApprovalActions {...appearance} className='flex items-center gap-2'>
      <ApprovalActionButton {...appearance} action='approve' size='sm' onClick={onApprove} disabled={locked}>
        {messages.allow}
      </ApprovalActionButton>
      <ApprovalActionButton
        {...appearance}
        action='reject'
        size='sm'
        variant='outline'
        onClick={onReject}
        disabled={locked}
      >
        {messages.deny}
      </ApprovalActionButton>
    </ApprovalActions>
  );
}
