'use client';

import { forwardRef, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Textarea, cn } from '../../../../../plugin-support.js';
import {
  approvalOptionLabel,
  approvalReceipt,
  isAllowKind,
  isKnownKind,
  isSettled,
  offersInterruptAction,
  type ToolFallbackApprovalProps,
} from './approval-model.js';
import type {
  ToolApprovalRenderAction,
  ToolApprovalRenderContext,
  ToolCallMethods,
} from '../render-types.js';
import { ToolFallbackApprovalReceipt } from './approval-receipt.js';
import {
  ApprovalConfirmation,
  ApprovalOptionButtons,
} from './approval-options.js';
import {
  ApprovalDecisionActions,
  CommandApprovalActions,
} from './approval-actions.js';
import { useApprovalInteraction } from './use-approval-interaction.js';

export const ToolFallbackApproval: React.ForwardRefExoticComponent<
  ToolFallbackApprovalProps & React.RefAttributes<HTMLDivElement>
> = forwardRef<HTMLDivElement, ToolFallbackApprovalProps>(
  function ToolFallbackApproval(props, ref) {
    const carryFocusRef = useRef(false);
    return useToolApproval({ ...props, forwardedRef: ref, carryFocusRef }).view;
  },
);

export function useToolApproval({
  tool,
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
  resumeInterrupt,
  commandRecord,
  status,
  approvalClassNames,
  approvalStyles,
  ...props
}: Omit<ToolFallbackApprovalProps, 'ref'> & {
  forwardedRef: React.ForwardedRef<HTMLDivElement>;
  carryFocusRef: React.MutableRefObject<boolean>;
}): {
  context: ToolApprovalRenderContext | undefined;
  methods: ToolCallMethods;
  view: ReactNode;
} {
  const appearance = { approvalClassNames, approvalStyles };
  const {
    messages,
    submitted,
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
    tool,
    addResult,
    resume,
    resumeInterrupt,
    interrupt,
    approval,
    respondToApproval,
    status,
    forwardedRef,
    carryFocusRef,
  });
  const knownRequest = decisionRequest ?? commandRecord?.request;
  const commandSettled =
    commandRecord !== undefined &&
    !commandRecord.pending &&
    status?.type === 'complete' &&
    !tool?.isPreliminary;
  const settled = (approval != null && isSettled(approval)) || commandSettled;
  const actionable = status?.type === 'requires-action' && !hidePendingApproval;
  const transport = decisionRequest
    ? submitDecision
    : approval
      ? respondToApproval
      : interrupt
        ? (resume ?? resumeInterrupt)
        : addResult;
  const disabled =
    locked || !canAnswer || settled || !actionable || transport === undefined;
  const actions: ToolApprovalRenderAction[] = [];
  const action = (
    id: string,
    label: string,
    kind: ToolApprovalRenderAction['kind'],
  ): ToolApprovalRenderAction => ({
    id,
    label,
    kind,
    disabled,
  });
  if (!settled && canAnswer && actionable) {
    if (decisionRequest !== undefined) {
      for (const decision of decisionRequest.allowedDecisions) {
        actions.push(
          action(
            decision,
            decision === 'approve'
              ? messages.allow
              : decision === 'reject'
                ? messages.deny
                : decision,
            decision === 'approve' || decision === 'reject'
              ? decision
              : 'custom',
          ),
        );
      }
    } else if (confirming) {
      actions.push(
        action('confirm', messages.confirm, 'confirm'),
        action('back', messages.back, 'back'),
      );
    } else if (declaredOptions?.length) {
      const allow = declaredOptions.filter((option) =>
        isAllowKind(option.kind),
      );
      const custom = declaredOptions.filter(
        (option) => !isKnownKind(option.kind),
      );
      const reject = declaredOptions.filter(
        (option) => isKnownKind(option.kind) && !isAllowKind(option.kind),
      );
      for (const option of [...allow, ...custom, ...reject]) {
        actions.push(
          action(
            option.id,
            approvalOptionLabel(option, messages),
            isAllowKind(option.kind)
              ? 'approve'
              : isKnownKind(option.kind)
                ? 'reject'
                : 'custom',
          ),
        );
      }
      if (reject.length === 0)
        actions.push(action('reject', messages.deny, 'reject'));
    } else {
      actions.push(
        action('approve', messages.allow, 'approve'),
        action('reject', messages.deny, 'reject'),
      );
    }
  }
  const decide = (approved: boolean, optionId?: string) => {
    if (disabled) return;
    if (decisionRequest) {
      const decision = approved ? 'approve' : 'reject';
      if (!decisionRequest.allowedDecisions.includes(decision)) return;
      void submit(() => submitDecision?.(decision)).catch(() => {});
      return;
    }
    if (declaredOptions?.length) {
      const matches = declaredOptions.filter((option) =>
        approved
          ? isAllowKind(option.kind) ||
            (optionId !== undefined && !isKnownKind(option.kind))
          : isKnownKind(option.kind) && !isAllowKind(option.kind),
      );
      const option =
        optionId !== undefined
          ? matches.find((item) => item.id === optionId)
          : (matches.find((item) => item.id === confirming?.id) ??
            (matches.length === 1 ? matches[0] : undefined));
      if (option) {
        if (confirming?.id === option.id) respondWithOption(option);
        else handleOption(option);
      } else if (!approved && matches.length === 0 && optionId === undefined) {
        respond(false);
      }
      return;
    }
    if (optionId === undefined) respond(approved);
  };
  const context: ToolApprovalRenderContext = {
    kind:
      knownRequest !== undefined
        ? 'command'
        : approval != null
          ? 'approval'
          : interrupt
            ? 'interrupt'
            : 'frontend',
    phase: settled
      ? 'settled'
      : submitted
        ? 'submitting'
        : !canAnswer || !actionable
          ? 'readonly'
          : decisionRequest === undefined && confirming
            ? 'confirming'
            : 'pending',
    prompt: approval?.prompt ?? knownRequest?.description,
    approval,
    interrupt,
    decisionRequest: knownRequest,
    options: declaredOptions ?? [],
    confirming,
    receipt:
      settled && approval
        ? approvalReceipt(approval, messages)
        : commandSettled && commandRecord?.decision
          ? {
              outcome:
                commandRecord.decision === 'approve'
                  ? 'allowed'
                  : commandRecord.decision === 'reject'
                    ? 'refused'
                    : 'closed',
              label:
                commandRecord.decision === 'approve'
                  ? messages.allowed
                  : commandRecord.decision === 'reject'
                    ? messages.denied
                    : commandRecord.decision,
            }
          : undefined,
    disabled,
    error,
    acceptsNote: acceptsText,
    note: answer,
    setNote: (note) => {
      if (!disabled && acceptsText) setAnswer(note);
    },
    approve: (optionId) => decide(true, optionId),
    reject: (optionId) => decide(false, optionId),
    actions,
    containerProps: {
      ref: settled ? receiptRef : setPendingGroup,
      tabIndex: -1,
    },
  };
  useLayoutEffect(() => {
    if (settled && focusReceiptRef.current != null) {
      focusReceiptRef.current = null;
      receiptRef.current?.focus({ preventScroll: true });
    }
  }, [settled, focusReceiptRef, receiptRef]);
  const methods: ToolCallMethods =
    !canAnswer || locked || settled || !actionable
      ? {}
      : {
          ...(addResult && !decisionRequest && !approval && !interrupt
            ? {
                addResult: (value: unknown) => {
                  void submit(() => addResult(value)).catch(() => {});
                },
              }
            : {}),
          ...(respondToApproval && approval && !decisionRequest
            ? {
                respondToApproval: (
                  value: Parameters<NonNullable<typeof respondToApproval>>[0],
                ) => submit(() => respondToApproval(value)),
              }
            : {}),
          ...(resume && interrupt && !approval && !decisionRequest
            ? {
                resume: (value: unknown) => {
                  void submit(() => resume(value)).catch(() => {});
                },
              }
            : {}),
          ...(resumeInterrupt && !approval && !decisionRequest
            ? {
                resumeInterrupt: (value: unknown) =>
                  submit(() => resumeInterrupt(value)),
              }
            : {}),
          ...(submitDecision && decisionRequest
            ? {
                submitDecision: (value: string) =>
                  submit(() => submitDecision(value)),
              }
            : {}),
        };
  const supported =
    approval?.display === undefined || approval.display === 'decision';
  const relevant =
    supported &&
    (approval != null ||
      knownRequest !== undefined ||
      interrupt != null ||
      (actionable && transport !== undefined));
  const renderContent = (view: ReactNode) => view;
  function renderDefaultApproval(): ReactNode {
    if (knownRequest && decisionRequest === undefined) return null;
    if (!approval && !decisionRequest && !actionable) return null;
    if (settled && approval) {
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

    if (
      !supported ||
      commandSettled ||
      hidePendingApproval ||
      !offersInterruptAction(status, approval, interrupt, decisionRequest)
    ) {
      return null;
    }

    const promptText = approval?.prompt ? (
      <p className="aui-tool-fallback-approval-prompt text-foreground whitespace-pre-line">
        {approval.prompt}
      </p>
    ) : decisionRequest?.description ? (
      <p className="aui-tool-fallback-approval-prompt text-foreground whitespace-pre-line">
        {decisionRequest.description}
      </p>
    ) : null;

    if (!canAnswer) {
      return (
        promptText && (
          <div
            data-slot="tool-fallback-approval"
            tabIndex={-1}
            className={cn(
              'aui-tool-fallback-approval flex flex-col gap-2 pt-1',
              className,
            )}
            {...props}
            ref={setPendingGroup}
          >
            {renderContent(promptText)}
          </div>
        )
      );
    }

    const errorText = error ? (
      <p
        role="alert"
        className="aui-tool-fallback-approval-error text-destructive text-xs whitespace-pre-line"
      >
        {error}
      </p>
    ) : null;

    if (decisionRequest !== undefined) {
      return (
        <div
          data-slot="tool-fallback-approval"
          data-interaction="command"
          tabIndex={-1}
          className={cn(
            'aui-tool-fallback-approval flex flex-col gap-2 pt-1',
            className,
          )}
          {...props}
          ref={setPendingGroup}
        >
          {renderContent(
            <>
              {promptText}
              <CommandApprovalActions
                {...appearance}
                decisions={decisionRequest.allowedDecisions}
                locked={locked || submitDecision === undefined}
                onDecision={(decisionType) => {
                  void submit(() => submitDecision?.(decisionType)).catch(
                    () => {},
                  );
                }}
              />
              {errorText}
            </>,
          )}
        </div>
      );
    }

    const answerField = acceptsText ? (
      <div className="aui-tool-fallback-approval-answer flex flex-col items-start gap-2">
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
          data-slot="tool-fallback-approval-confirm"
          tabIndex={-1}
          className={cn(
            'aui-tool-fallback-approval-confirm flex flex-col gap-2 pt-1',
            className,
          )}
          {...props}
          ref={setPendingGroup}
        >
          {renderContent(
            <ApprovalConfirmation
              {...appearance}
              confirming={confirming}
              locked={locked}
              onConfirm={() => respondWithOption(confirming)}
              onBack={() => {
                focusPendingGroup();
                setConfirmingId(null);
              }}
            />,
          )}
        </div>
      );
    }

    if (declaredOptions && declaredOptions.length > 0) {
      return (
        <div
          data-slot="tool-fallback-approval"
          tabIndex={-1}
          className={cn(
            'aui-tool-fallback-approval flex flex-col gap-2 pt-1',
            className,
          )}
          {...props}
          ref={setPendingGroup}
        >
          {renderContent(
            <>
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
            </>,
          )}
        </div>
      );
    }

    return (
      <div
        data-slot="tool-fallback-approval"
        tabIndex={-1}
        className={cn(
          'aui-tool-fallback-approval flex flex-col gap-2 pt-1',
          className,
        )}
        {...props}
        ref={setPendingGroup}
      >
        {renderContent(
          <>
            {promptText}
            <ApprovalDecisionActions
              {...appearance}
              locked={locked}
              onApprove={() => respond(true)}
              onReject={() => respond(false)}
            />
            {answerField}
            {errorText}
          </>,
        )}
      </div>
    );
  }
  return {
    context: relevant ? context : undefined,
    methods,
    view: relevant ? renderDefaultApproval() : null,
  };
}
