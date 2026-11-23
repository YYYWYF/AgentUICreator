'use client';

import { forwardRef, useRef } from 'react';
import { Textarea, cn } from '../../../../../plugin-support.js';
import { isSettled, offersInterruptAction, type ToolFallbackApprovalProps } from './approval-model.js';
import { ToolFallbackApprovalReceipt } from './approval-receipt.js';
import { ApprovalConfirmation, ApprovalOptionButtons } from './approval-options.js';
import {
  ApprovalDecisionActions,
  CommandApprovalActions,
} from './approval-actions.js';
import { useApprovalInteraction } from './use-approval-interaction.js';

export const ToolFallbackApproval: React.ForwardRefExoticComponent<
  ToolFallbackApprovalProps & React.RefAttributes<HTMLDivElement>
> = forwardRef<HTMLDivElement, ToolFallbackApprovalProps>(function ToolFallbackApproval(props, ref) {
  const carryFocusRef = useRef(false);
  // Question displays have no AG-UI mapping here and must never become decisions.
  if (props.approval?.display !== undefined && props.approval.display !== 'decision') {
    return null;
  }
  return (
    <ToolFallbackApprovalImpl key={props.approval?.id} carryFocusRef={carryFocusRef} forwardedRef={ref} {...props} />
  );
});

function ToolFallbackApprovalImpl({
  className,
  forwardedRef,
  carryFocusRef,
  addResult,
  resume,
  interrupt,
  approval,
  respondToApproval,
  decisionRequest,
  submitDecision,
  status,
  approvalClassNames,
  approvalStyles,
  ...props
}: Omit<ToolFallbackApprovalProps, 'ref'> & {
  forwardedRef: React.ForwardedRef<HTMLDivElement>;
  carryFocusRef: React.MutableRefObject<boolean>;
}) {
  const appearance = { approvalClassNames, approvalStyles };
  const {
    messages,
    locked,
    canAnswer,
    answer,
    setAnswer,
    error,
    hidePendingApproval,
    setPendingGroup,
    receiptRef,
    focusReceiptRef,
    focusPendingGroup,
    setConfirmingId,
    declaredOptions,
    acceptsText,
    submit,
    respond,
    handleOption,
    respondWithOption,
    confirming,
  } = useApprovalInteraction({
    addResult,
    resume,
    interrupt,
    approval,
    respondToApproval,
    status,
    forwardedRef,
    carryFocusRef,
  });
  if (approval != null && isSettled(approval)) {
    return (
      <ToolFallbackApprovalReceipt
        approval={approval}
        receiptRef={receiptRef}
        focusReceiptRef={focusReceiptRef}
        className={className}
        {...props}
      />
    );
  }

  if (hidePendingApproval || !offersInterruptAction(status, approval, interrupt, decisionRequest)) {
    return null;
  }

  const promptText = approval?.prompt ? (
    <p className='aui-tool-fallback-approval-prompt text-foreground whitespace-pre-line'>{approval.prompt}</p>
  ) : decisionRequest?.description ? (
    <p className='aui-tool-fallback-approval-prompt text-foreground whitespace-pre-line'>
      {decisionRequest.description}
    </p>
  ) : null;

  if (!canAnswer) {
    return (
      promptText && (
        <div
          data-slot='tool-fallback-approval'
          tabIndex={-1}
          className={cn('aui-tool-fallback-approval flex flex-col gap-2 pt-1', className)}
          {...props}
          ref={setPendingGroup}
        >
          {promptText}
        </div>
      )
    );
  }

  const errorText = error ? (
    <p role='alert' className='aui-tool-fallback-approval-error text-destructive text-xs whitespace-pre-line'>
      {error}
    </p>
  ) : null;

  if (decisionRequest !== undefined) {
    return (
      <div
        data-slot='tool-fallback-approval'
        data-interaction='command'
        tabIndex={-1}
        className={cn('aui-tool-fallback-approval flex flex-col gap-2 pt-1', className)}
        {...props}
        ref={setPendingGroup}
      >
        {promptText}
        <CommandApprovalActions
          {...appearance}
          decisions={decisionRequest.allowedDecisions}
          locked={locked || submitDecision === undefined}
          onDecision={(decisionType) => submit(() => submitDecision?.(decisionType))}
        />
        {errorText}
      </div>
    );
  }

  const answerField = acceptsText ? (
    <div className='aui-tool-fallback-approval-answer flex flex-col items-start gap-2'>
      <Textarea
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        disabled={locked}
        aria-label={messages.note}
        placeholder={messages.notePlaceholder}
      />
    </div>
  ) : null;

  if (confirming) {
    return (
      <div
        data-slot='tool-fallback-approval-confirm'
        tabIndex={-1}
        className={cn('aui-tool-fallback-approval-confirm flex flex-col gap-2 pt-1', className)}
        {...props}
        ref={setPendingGroup}
      >
        <ApprovalConfirmation
          {...appearance}
          confirming={confirming}
          locked={locked}
          onConfirm={() => respondWithOption(confirming)}
          onBack={() => {
            focusPendingGroup();
            setConfirmingId(null);
          }}
        />
      </div>
    );
  }

  if (declaredOptions && declaredOptions.length > 0) {
    return (
      <div
        data-slot='tool-fallback-approval'
        tabIndex={-1}
        className={cn('aui-tool-fallback-approval flex flex-col gap-2 pt-1', className)}
        {...props}
        ref={setPendingGroup}
      >
        {promptText}
        <ApprovalOptionButtons
          {...appearance}
          options={declaredOptions}
          locked={locked}
          onOption={handleOption}
          onReject={() => respond(false)}
        />
        {answerField}
        {errorText}
      </div>
    );
  }

  return (
    <div
      data-slot='tool-fallback-approval'
      tabIndex={-1}
      className={cn('aui-tool-fallback-approval flex flex-col gap-2 pt-1', className)}
      {...props}
      ref={setPendingGroup}
    >
      {promptText}
      <ApprovalDecisionActions
        {...appearance}
        locked={locked}
        onApprove={() => respond(true)}
        onReject={() => respond(false)}
      />
      {answerField}
      {errorText}
    </div>
  );
}
