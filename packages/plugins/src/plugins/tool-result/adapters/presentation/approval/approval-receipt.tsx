'use client';

import { useLayoutEffect } from 'react';
import {
  useLocale,
  cn,
  CheckIcon,
  XCircleIcon,
  CircleMinusIcon,
  type ToolCallMessagePart,
} from '../../../../../plugin-support.js';
import { approvalReceipt, type ApprovalReceipt } from './approval-model.js';

const receiptIcon = (outcome: ApprovalReceipt['outcome']): React.ElementType =>
  ({
    allowed: CheckIcon,
    refused: XCircleIcon,
    closed: CircleMinusIcon,
  })[outcome];

export function ToolFallbackApprovalReceipt({
  approval,
  className,
  focusReceiptRef,
  receiptRef,
  ...props
}: React.ComponentPropsWithoutRef<'div'> & {
  approval: NonNullable<ToolCallMessagePart['approval']>;
  focusReceiptRef: React.MutableRefObject<string | null | undefined>;
  receiptRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  useLayoutEffect(() => {
    const shouldFocus = focusReceiptRef.current === approval.id;
    focusReceiptRef.current = null;
    if (shouldFocus) {
      receiptRef.current?.focus({ preventScroll: true });
    }
  }, [approval.id, focusReceiptRef, receiptRef]);

  const messages = useLocale('toolPresentation');
  const receipt = approvalReceipt(approval, messages);
  const Icon = receiptIcon(receipt.outcome);
  const notes = [
    ...new Set(
      [approval.text, approval.reason].filter((value): value is string => typeof value === 'string' && value !== ''),
    ),
  ];

  return (
    <div
      ref={receiptRef}
      data-slot='tool-fallback-approval-receipt'
      data-outcome={receipt.outcome}
      tabIndex={-1}
      className={cn('aui-tool-fallback-approval-receipt flex flex-col gap-1.5 pt-1', className)}
      {...props}
    >
      {approval.prompt ? (
        <p className='aui-tool-fallback-approval-prompt text-muted-foreground whitespace-pre-line'>{approval.prompt}</p>
      ) : null}
      <p className='aui-tool-fallback-approval-receipt-label flex items-center gap-1.5'>
        <Icon aria-hidden className='text-muted-foreground size-3.5 shrink-0' />
        <span data-agent-ui-owned='' className='font-medium'>
          {receipt.label}
        </span>
        {receipt.option !== undefined ? (
          <span data-agent-ui-owned='' className='text-muted-foreground'>
            · {receipt.option}
          </span>
        ) : null}
      </p>
      {notes.map((text) => (
        <p key={text} className='aui-tool-fallback-approval-receipt-note text-muted-foreground whitespace-pre-line'>
          {text}
        </p>
      ))}
    </div>
  );
}
