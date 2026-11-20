'use client';

import { forwardRef, useRef } from 'react';
import { Textarea, cn } from '../../../../../plugin-support.js';
import { isSettled, offersInterruptAction, type ToolFallbackApprovalProps } from './approval-model.js';
import { ToolFallbackApprovalReceipt } from './approval-receipt.js';
import { ToolFallbackApprovalQuestions } from './approval-questions.js';
import { ApprovalConfirmation, ApprovalOptionButtons } from './approval-options.js';
import {
  ApprovalActionButton,
  ApprovalActions,
  ApprovalDecisionActions,
  CommandApprovalActions,
  pressable,
} from './approval-actions.js';
import { useApprovalInteraction } from './use-approval-interaction.js';

export const ToolFallbackApproval: React.ForwardRefExoticComponent<
  ToolFallbackApprovalProps & React.RefAttributes<HTMLDivElement>
> = forwardRef<HTMLDivElement, ToolFallbackApprovalProps>(function ToolFallbackApproval(props, ref) {
  const carryFocusRef = useRef(false);
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
    submitAnswer,
    dismiss,
    handleOption,
    respondWithOption,
    confirming,
    question,
    dismissible,
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

  const dismissButton = dismissible ? (
    <ApprovalActionButton
      {...appearance}
      size='sm'
      variant='outline'
      className={pressable}
      onClick={dismiss}
      disabled={locked}
    >
      {messages.dismiss}
    </ApprovalActionButton>
  ) : null;

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
        aria-label={question ? (approval?.prompt ?? messages.answer) : messages.note}
        placeholder={question ? messages.answerPlaceholder : messages.notePlaceholder}
      />
      {question && (
        <ApprovalActions {...appearance} className='flex items-center gap-2'>
          <ApprovalActionButton
            {...appearance}
            size='sm'
            className={pressable}
            onClick={submitAnswer}
            disabled={locked}
          >
            {messages.send}
          </ApprovalActionButton>
          {dismissButton}
        </ApprovalActions>
      )}
    </div>
  ) : null;

  if (approval?.display === 'questions' && respondToApproval) {
    return (
      <div
        data-slot='tool-fallback-approval'
        tabIndex={-1}
        className={cn('aui-tool-fallback-approval flex flex-col gap-3 pt-1', className)}
        {...props}
        ref={setPendingGroup}
      >
        {promptText}
        <ToolFallbackApprovalQuestions
          {...appearance}
          questions={approval.questions ?? []}
          dismissible={approval.dismissible === true}
          locked={locked}
          onSend={(answers) => submit(() => respondToApproval({ answers }))}
          onDismiss={dismiss}
        />
        {errorText}
      </div>
    );
  }

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
          question={question}
          acceptsText={acceptsText}
          onOption={handleOption}
          onReject={() => respond(false)}
          dismissButton={dismissButton}
        />
        {answerField}
        {errorText}
      </div>
    );
  }

  // A question carries no decision to fabricate, so it renders only what the
  // request declared, even when that leaves nothing to act on here.
  if (question) {
    return (
      <div
        data-slot='tool-fallback-approval'
        tabIndex={-1}
        className={cn('aui-tool-fallback-approval flex flex-col gap-2 pt-1', className)}
        {...props}
        ref={setPendingGroup}
      >
        {promptText}
        {answerField}
        {!acceptsText && dismissButton && (
          <ApprovalActions {...appearance} className='flex items-center gap-2'>
            {dismissButton}
          </ApprovalActions>
        )}
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
