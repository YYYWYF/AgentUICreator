'use client';

import { memo, useLayoutEffect, useRef, useState } from 'react';
import type { UIPluginElementProps, ConversationToolCallProps } from '../../../../public.js';
import {
  cn,
  useConversationCommandDecision,
  type ToolCallMessagePartComponent,
  type ToolCallMessagePartProps,
} from '../../../../plugin-support.js';
import { ToolFallbackRoot, ToolFallbackTrigger, ToolFallbackContent } from './tool-card.js';
import { ToolFallbackArgs, ToolFallbackResult, ToolFallbackError, formatUnknownValue } from './tool-content.js';
import { ToolFallbackApproval } from './approval/approval.js';
import { isSettled, offersInterruptAction, type ToolFallbackApprovalAppearance } from './approval/approval-model.js';
export type { ToolFallbackRootProps } from './tool-card.js';
export type { ToolApprovalClassNames, ToolApprovalStyles } from './approval/approval-model.js';

export interface ToolCardPresentationProps extends UIPluginElementProps, ToolFallbackApprovalAppearance {
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  buttonProps?: Omit<
    React.ComponentProps<typeof ToolFallbackTrigger>,
    'toolName' | 'status' | 'responseDeliveryStatus' | 'children'
  >;
  contentProps?: Omit<React.ComponentProps<typeof ToolFallbackContent>, 'children'>;
  argsProps?: Omit<React.ComponentProps<typeof ToolFallbackArgs>, 'argsText' | 'children'>;
  resultProps?: Omit<React.ComponentProps<typeof ToolFallbackResult>, 'result' | 'children'>;
  renderResult?: (result: unknown) => React.ReactNode;
  errorProps?: Omit<React.ComponentProps<typeof ToolFallbackError>, 'status' | 'children'>;
  approvalProps?: Omit<React.ComponentPropsWithoutRef<'div'>, 'children'>;
  renderDetails?: (defaultDetails: React.ReactNode) => React.ReactNode;
}
type ToolFallbackProps = React.ComponentProps<ToolCallMessagePartComponent> &
  Pick<ConversationToolCallProps, 'decisionRequest' | 'submitDecision'> &
  ToolCardPresentationProps;

const ToolFallbackImpl: React.FC<ToolFallbackProps> = ({
  toolName,
  argsText,
  result,
  status,
  responseDeliveryStatus,
  addResult,
  resume,
  interrupt,
  approval,
  respondToApproval,
  decisionRequest,
  submitDecision,
  expanded,
  defaultExpanded,
  onExpandedChange,
  className,
  style,
  id,
  role,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescription,
  onClick,
  buttonProps,
  contentProps,
  argsProps,
  resultProps,
  renderResult,
  errorProps,
  approvalProps,
  approvalClassNames,
  approvalStyles,
  renderDetails,
}) => {
  const isCancelled = status?.type === 'incomplete' && status.reason === 'cancelled';
  const isRequiresAction = status?.type === 'requires-action';
  const shouldRenderApproval =
    approval != null ||
    decisionRequest != null ||
    (isRequiresAction && offersInterruptAction(status, approval, interrupt, decisionRequest));

  const [open, setOpen] = useState(defaultExpanded ?? isRequiresAction);
  const [prevRequiresAction, setPrevRequiresAction] = useState(isRequiresAction);
  if (isRequiresAction !== prevRequiresAction) {
    setPrevRequiresAction(isRequiresAction);
    if (isRequiresAction) {
      setOpen(true);
    }
  }
  const approvalHadFocusRef = useRef(false);
  const approvalElementRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    const focusedElement = approvalElementRef.current;
    if (!focusedElement || focusedElement.isConnected || isRequiresAction || !approvalHadFocusRef.current) {
      return;
    }

    const shouldFocusTrigger = approval == null || !isSettled(approval);
    approvalHadFocusRef.current = false;
    const { activeElement, body } = focusedElement.ownerDocument;
    if (shouldFocusTrigger && (activeElement == null || activeElement === body)) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [approval, isRequiresAction, status?.type]);

  const details = (
    <>
      <ToolFallbackError status={status} {...errorProps} />
      <ToolFallbackArgs argsText={argsText} className={cn(isCancelled && 'opacity-60')} {...argsProps} />
      {shouldRenderApproval && (
        <ToolFallbackApproval
          addResult={addResult}
          resume={resume}
          interrupt={interrupt}
          approval={approval}
          respondToApproval={respondToApproval}
          decisionRequest={decisionRequest}
          submitDecision={submitDecision}
          status={status}
          {...approvalProps}
          approvalClassNames={approvalClassNames}
          approvalStyles={approvalStyles}
          onFocusCapture={(event) => {
            approvalProps?.onFocusCapture?.(event);
            const root = event.currentTarget.closest('[data-slot="tool-fallback-root"]');
            triggerRef.current = root?.querySelector<HTMLButtonElement>('[data-slot="tool-fallback-trigger"]') ?? null;
            approvalElementRef.current = event.currentTarget;
            approvalHadFocusRef.current = true;
          }}
          onBlurCapture={(event) => {
            approvalProps?.onBlurCapture?.(event);
            const relatedTarget = event.relatedTarget;
            const stillFocused = relatedTarget
              ? event.currentTarget.contains(relatedTarget as Node)
              : event.currentTarget.contains(event.currentTarget.ownerDocument.activeElement);
            if (!stillFocused) {
              approvalHadFocusRef.current = false;
            }
          }}
        />
      )}
      {renderResult ? renderResult(result) : <ToolFallbackResult result={result} {...resultProps} />}
    </>
  );

  return (
    <ToolFallbackRoot
      className={className}
      style={style}
      id={id}
      role={role}
      aria-label={ariaLabel}
      aria-describedby={ariaDescription}
      onClick={onClick}
      open={expanded ?? open}
      onOpenChange={(value) => {
        setOpen(value);
        onExpandedChange?.(value);
      }}
    >
      <ToolFallbackTrigger
        toolName={toolName}
        status={status}
        responseDeliveryStatus={responseDeliveryStatus}
        {...buttonProps}
      />
      <ToolFallbackContent {...contentProps}>{renderDetails ? renderDetails(details) : details}</ToolFallbackContent>
    </ToolFallbackRoot>
  );
};

const ToolFallback = memo(ToolFallbackImpl) as unknown as React.FC<ToolFallbackProps> & {
  Root: typeof ToolFallbackRoot;
  Trigger: typeof ToolFallbackTrigger;
  Content: typeof ToolFallbackContent;
  Args: typeof ToolFallbackArgs;
  Result: typeof ToolFallbackResult;
  Error: typeof ToolFallbackError;
  Approval: typeof ToolFallbackApproval;
};

ToolFallback.displayName = 'ToolFallback';
ToolFallback.Root = ToolFallbackRoot;
ToolFallback.Trigger = ToolFallbackTrigger;
ToolFallback.Content = ToolFallbackContent;
ToolFallback.Args = ToolFallbackArgs;
ToolFallback.Result = ToolFallbackResult;
ToolFallback.Error = ToolFallbackError;
ToolFallback.Approval = ToolFallbackApproval;

export {
  formatUnknownValue,
  offersInterruptAction,
  ToolFallback,
  ToolFallbackApproval,
  ToolFallbackArgs,
  ToolFallbackContent,
  ToolFallbackError,
  ToolFallbackResult,
  ToolFallbackRoot,
  ToolFallbackTrigger,
};

export type ToolCallCardProps = Readonly<ConversationToolCallProps> &
  ToolCardPresentationProps &
  Partial<
    Pick<ToolCallMessagePartProps, 'approval' | 'respondToApproval' | 'interrupt' | 'resume' | 'responseDeliveryStatus'>
  >;
export const ToolCallCard: React.FC<ToolCallCardProps> &
  Pick<typeof ToolFallback, 'Root' | 'Trigger' | 'Content' | 'Args' | 'Result' | 'Error' | 'Approval'> = Object.assign(
  function ToolCallCard(props: ToolCallCardProps) {
    const command = useConversationCommandDecision(props.toolCallId);
    const resolved =
      command === undefined
        ? props
        : {
            ...props,
            addResult: undefined,
            decisionRequest: props.decisionRequest ?? command.request,
            submitDecision: props.submitDecision ?? command.submit,
            status: { type: 'requires-action' as const, reason: 'interrupt' },
          };
    return <ToolFallback {...(resolved as unknown as React.ComponentProps<typeof ToolFallback>)} />;
  },
  {
    Root: ToolFallback.Root,
    Trigger: ToolFallback.Trigger,
    Content: ToolFallback.Content,
    Args: ToolFallback.Args,
    Result: ToolFallback.Result,
    Error: ToolFallback.Error,
    Approval: ToolFallback.Approval,
  },
);
