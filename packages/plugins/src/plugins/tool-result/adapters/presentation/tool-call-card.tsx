'use client';

import {
  memo,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type FC,
  type NamedExoticComponent,
  type ReactNode,
} from 'react';
import type { UIPluginElementProps } from '../../../../public.js';
import {
  cn,
  useConversationCommandDecisionRecord,
  type ToolCallMessagePartStatus,
} from '../../../../plugin-support.js';
import {
  ToolFallbackRoot,
  ToolFallbackTrigger,
  ToolFallbackContent,
} from './tool-card.js';
import {
  ToolFallbackArgs,
  ToolFallbackResult,
  ToolFallbackError,
  formatUnknownValue,
} from './tool-content.js';
import { ToolFallbackApproval, useToolApproval } from './approval/approval.js';
import {
  isSettled,
  offersInterruptAction,
  type ToolFallbackApprovalAppearance,
} from './approval/approval-model.js';
import {
  useToolResultPresentation,
  type ToolResultContentProps,
} from './result/result-content.js';
import type {
  ToolCallRenderContext,
  ToolCallComponentProps,
  ToolResultComponents,
  ToolCallInput,
  ToolCallData,
  ToolErrorRenderContext,
} from './render-types.js';
export type { ToolFallbackRootProps } from './tool-card.js';
export type {
  ToolApprovalClassNames,
  ToolApprovalStyles,
} from './approval/approval-model.js';

export interface ToolCardPresentationProps
  extends UIPluginElementProps,
    ToolFallbackApprovalAppearance {
  renderToolCall?: ((view: ToolCallRenderContext) => ReactNode) | undefined;
  components?: ToolResultComponents | undefined;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  buttonProps?: Omit<
    ComponentProps<typeof ToolFallbackTrigger>,
    'toolName' | 'status' | 'responseDeliveryStatus' | 'children'
  >;
  contentProps?: Omit<ComponentProps<typeof ToolFallbackContent>, 'children'>;
  argsProps?: Omit<
    ComponentProps<typeof ToolFallbackArgs>,
    'argsText' | 'children'
  >;
  resultProps?: Omit<
    ComponentProps<typeof ToolFallbackResult>,
    'result' | 'children'
  >;
  errorProps?: Omit<
    ComponentProps<typeof ToolFallbackError>,
    'status' | 'children'
  >;
  approvalProps?: Omit<ComponentProps<'div'>, 'children'>;
}
export type ToolCallCardProps = ToolCallInput &
  ToolCardPresentationProps &
  Omit<ToolResultContentProps, 'result'>;
type FallbackProps = ToolCallCardProps & {
  status: ToolCallMessagePartStatus;
  commandRecord?: ReturnType<typeof useConversationCommandDecisionRecord>;
  structuredResults?: boolean;
  resultOnly?: boolean;
};

const ToolFallbackImpl: FC<FallbackProps> = ({
  toolCallId,
  toolName,
  args,
  argsText,
  result,
  isPreliminary,
  isError,
  messages,
  status,
  responseDeliveryStatus,
  addResult,
  resume,
  resumeInterrupt,
  interrupt,
  approval,
  respondToApproval,
  decisionRequest,
  submitDecision,
  unstable_recordInteraction,
  artifact,
  timing,
  mcp,
  providerMetadata,
  modelContent,
  parentId,
  unstable_interactions,
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
  errorProps,
  approvalProps,
  approvalClassNames,
  approvalStyles,
  renderToolCall,
  components,
  resolveFile,
  commandRecord,
  structuredResults,
  resultOnly,
}) => {
  const isCancelled =
    status.type === 'incomplete' && status.reason === 'cancelled';
  const isRequiresAction = status.type === 'requires-action';
  const shouldRenderApproval =
    approval != null ||
    decisionRequest != null ||
    (isRequiresAction &&
      offersInterruptAction(status, approval, interrupt, decisionRequest));
  const tool: ToolCallData = {
    toolCallId,
    toolName,
    args,
    result,
    status,
    ...(artifact === undefined ? {} : { artifact }),
    ...(timing === undefined ? {} : { timing }),
    ...(mcp === undefined ? {} : { mcp }),
    ...(providerMetadata === undefined ? {} : { providerMetadata }),
    ...(modelContent === undefined ? {} : { modelContent }),
    ...(parentId === undefined ? {} : { parentId }),
    ...(unstable_interactions === undefined ? {} : { unstable_interactions }),
    ...(argsText === undefined ? {} : { argsText }),
    ...(isPreliminary === undefined ? {} : { isPreliminary }),
    ...(isError === undefined ? {} : { isError }),
    ...(messages === undefined ? {} : { messages }),
    ...(approval === undefined ? {} : { approval }),
    ...(interrupt === undefined ? {} : { interrupt }),
    ...(responseDeliveryStatus === undefined ? {} : { responseDeliveryStatus }),
    ...((decisionRequest ?? commandRecord?.request) === undefined
      ? {}
      : { decisionRequest: decisionRequest ?? commandRecord?.request }),
  };
  const [open, setOpen] = useState(defaultExpanded ?? isRequiresAction);
  const isComplete = status.type === 'complete' && !isPreliminary;
  const [prevComplete, setPrevComplete] = useState(isComplete);
  if (isComplete !== prevComplete) {
    setPrevComplete(isComplete);
    if (isComplete && !shouldRenderApproval) setOpen(false);
  }
  const [prevRequiresAction, setPrevRequiresAction] =
    useState(isRequiresAction);
  if (isRequiresAction !== prevRequiresAction) {
    setPrevRequiresAction(isRequiresAction);
    if (isRequiresAction) setOpen(true);
  }
  const approvalHadFocusRef = useRef(false);
  const approvalElementRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const carryFocusRef = useRef(false);
  useLayoutEffect(() => {
    const element = approvalElementRef.current;
    if (
      !element ||
      element.isConnected ||
      isRequiresAction ||
      !approvalHadFocusRef.current
    )
      return;
    const shouldFocus = approval == null || !isSettled(approval);
    approvalHadFocusRef.current = false;
    const { activeElement, body } = element.ownerDocument;
    if (shouldFocus && (activeElement == null || activeElement === body))
      triggerRef.current?.focus({ preventScroll: true });
  }, [approval, isRequiresAction, status.type]);

  // Controllers run independently of which default nodes the renderer mounts.
  const approvalPresentation = useToolApproval({
    tool,
    addResult,
    resume,
    resumeInterrupt,
    interrupt,
    approval,
    respondToApproval,
    decisionRequest,
    submitDecision,
    status,
    commandRecord,
    forwardedRef: null,
    carryFocusRef,
    ...approvalProps,
    approvalClassNames,
    approvalStyles,
    onFocusCapture: (event) => {
      approvalProps?.onFocusCapture?.(event);
      const root =
        event.currentTarget.closest('[data-slot="tool-fallback-root"]') ??
        event.currentTarget.closest('[data-slot="tool-result"]');
      triggerRef.current =
        root?.querySelector<HTMLButtonElement>(
          '[data-slot="tool-fallback-trigger"]',
        ) ?? null;
      approvalElementRef.current = event.currentTarget;
      approvalHadFocusRef.current = true;
    },
    onBlurCapture: (event) => {
      approvalProps?.onBlurCapture?.(event);
      const target = event.relatedTarget;
      if (
        !(target
          ? event.currentTarget.contains(target as Node)
          : event.currentTarget.contains(
              event.currentTarget.ownerDocument.activeElement,
            ))
      )
        approvalHadFocusRef.current = false;
    },
  });
  const output = useToolResultPresentation(
    { result, components, ...(resolveFile ? { resolveFile } : {}) },
    structuredResults ?? false,
    <ToolFallbackResult result={result} {...resultProps} />,
  );
  const structured = output.context.kind === 'parts';
  const onOpenChange = (value: boolean) => {
    setOpen(value);
    onExpandedChange?.(value);
  };
  const errorText =
    status.type === 'incomplete' && status.error != null
      ? formatUnknownValue(status.error)
      : '';
  const error: ToolErrorRenderContext | undefined =
    status.type === 'incomplete' && errorText
      ? { status, error: status.error, errorText, cancelled: isCancelled }
      : undefined;
  const methods = {
    ...approvalPresentation.methods,
    ...(unstable_recordInteraction ? { unstable_recordInteraction } : {}),
  };
  const owner: ToolCallComponentProps = {
    tool,
    methods,
    approval: approvalPresentation.context,
    result: output.context,
    error,
  };
  const Header = components?.Header;
  const Args = components?.Args;
  const Approval = components?.Approval;
  const Result = components?.Result;
  const Error = components?.Error;
  const trigger = (
    <ToolFallbackTrigger
      toolName={toolName}
      status={status}
      responseDeliveryStatus={responseDeliveryStatus}
      {...buttonProps}
    />
  );
  const defaultArgs = argsText ? (
    <ToolFallbackArgs
      argsText={argsText}
      className={cn(isCancelled && 'opacity-60')}
      {...argsProps}
    />
  ) : null;
  const title = Header ? (
    <Header
      {...owner}
      expanded={expanded ?? open}
      onExpandedChange={onOpenChange}
      defaultView={trigger}
    />
  ) : (
    trigger
  );
  const argumentsView = Args ? (
    <Args
      {...owner}
      args={args}
      argsText={argsText}
      defaultView={defaultArgs}
    />
  ) : (
    defaultArgs
  );
  const approvalView =
    Approval && owner.approval ? (
      <Approval
        {...owner}
        approval={owner.approval}
        defaultView={approvalPresentation.view}
      />
    ) : (
      approvalPresentation.view
    );
  const resultView =
    result === undefined ? null : Result ? (
      <Result {...owner} defaultView={output.view} />
    ) : (
      output.view
    );
  const defaultError = error ? (
    <ToolFallbackError status={status} {...errorProps} />
  ) : null;
  const errorView =
    Error && error ? (
      <Error {...owner} error={error} defaultView={defaultError} />
    ) : (
      defaultError
    );
  // This summary can be mounted by itself, outside the default disclosure tree.
  const header = (
    <ToolFallbackRoot open={expanded ?? open} onOpenChange={onOpenChange}>
      {title}
      <ToolFallbackContent {...contentProps}>
        {argumentsView}
      </ToolFallbackContent>
    </ToolFallbackRoot>
  );
  const views = {
    header,
    args: argumentsView,
    approval: approvalView,
    result: resultView,
    error: errorView,
  };
  const body = (
    <>
      {views.error}
      {views.approval}
      {views.result}
    </>
  );
  const appearance = {
    className,
    style,
    id,
    role,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescription,
    onClick,
  };
  const card = (
    <ToolFallbackRoot
      {...(!structured ? appearance : {})}
      open={expanded ?? open}
      onOpenChange={onOpenChange}
    >
      {title}
      <ToolFallbackContent {...contentProps}>
        {views.error}
        {views.args}
        {views.approval}
        {!structured && views.result}
      </ToolFallbackContent>
    </ToolFallbackRoot>
  );
  const wrap = (children: ReactNode) => (
    <div
      {...appearance}
      data-agent-ui-owned=""
      data-slot="tool-result"
      className={cn('flex min-w-0 max-w-full flex-col gap-3', className)}
    >
      {children}
    </div>
  );
  if (resultOnly) return <div {...appearance}>{views.result}</div>;
  const ApprovalCard = components?.ApprovalCard;
  if (ApprovalCard && owner.approval) {
    return wrap(
      <ApprovalCard
        {...owner}
        approval={owner.approval}
        header={header}
        defaultView={body}
        views={views}
        expanded={expanded ?? open}
        onExpandedChange={onOpenChange}
      />,
    );
  }
  if (renderToolCall) {
    const rendered = renderToolCall({ header, defaultView: body });
    return rendered == null ? null : wrap(rendered);
  }
  return structured
    ? wrap(
        <>
          {card}
          {views.result}
        </>,
      )
    : card;
};

type ToolCardComponents = {
  Root: typeof ToolFallbackRoot;
  Trigger: typeof ToolFallbackTrigger;
  Content: typeof ToolFallbackContent;
  Args: typeof ToolFallbackArgs;
  Result: typeof ToolFallbackResult;
  Error: typeof ToolFallbackError;
  Approval: typeof ToolFallbackApproval;
};
const ToolFallback: NamedExoticComponent<FallbackProps> & ToolCardComponents =
  Object.assign(memo(ToolFallbackImpl), {
    Root: ToolFallbackRoot,
    Trigger: ToolFallbackTrigger,
    Content: ToolFallbackContent,
    Args: ToolFallbackArgs,
    Result: ToolFallbackResult,
    Error: ToolFallbackError,
    Approval: ToolFallbackApproval,
  });
ToolFallback.displayName = 'ToolFallback';
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
export const ToolCallCard: FC<
  ToolCallCardProps & { structuredResults?: boolean; resultOnly?: boolean }
> &
  ToolCardComponents = Object.assign(
  function ToolCallCard(
    props: ToolCallCardProps & {
      structuredResults?: boolean;
      resultOnly?: boolean;
    },
  ) {
    const supplied =
      props.status.type === 'requires-action' &&
      props.decisionRequest &&
      props.submitDecision
        ? { request: props.decisionRequest, submit: props.submitDecision }
        : undefined;
    const record = useConversationCommandDecisionRecord(
      props.toolCallId,
      supplied,
    );
    const resolved = record?.pending
      ? {
          ...props,
          addResult: undefined,
          decisionRequest: record.request,
          submitDecision: record.submit,
          status: { type: 'requires-action' as const, reason: 'interrupt' },
        }
      : props;
    return (
      <ToolFallback
        {...(resolved as unknown as FallbackProps)}
        commandRecord={record}
      />
    );
  },
  {
    Root: ToolFallbackRoot,
    Trigger: ToolFallbackTrigger,
    Content: ToolFallbackContent,
    Args: ToolFallbackArgs,
    Result: ToolFallbackResult,
    Error: ToolFallbackError,
    Approval: ToolFallbackApproval,
  },
);
