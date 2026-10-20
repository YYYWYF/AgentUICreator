"use client";

import { useAgentUILocale, DEFAULT_AGENT_UI_MESSAGES, formatPresentationMessage, type AgentUILocaleMessages } from "../../../../plugin-support.js";

import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleMinusIcon,
  LoaderIcon,
  XCircleIcon,
} from "../../../../plugin-support.js";
import {
  toolApprovalAcceptsText,
  useAuiState,
  useScrollLock,
  useToolCallElapsed,
  type ToolApprovalAnswer,
  type ToolApprovalOption,
  type ToolApprovalQuestion,
  type ToolCallMessagePart,
  type ToolCallMessagePartProps,
  type ToolCallMessagePartStatus,
  type ToolCallMessagePartComponent,
} from "../../../../plugin-support.js";
import { cn } from "../../../../plugin-support.js";
import {
  FallbackDisclosure as Collapsible,
  FallbackDisclosureContent as CollapsibleContent,
  FallbackDisclosureTrigger as CollapsibleTrigger,
} from "../../../../plugin-support.js";
import { Button } from "../../../../plugin-support.js";
import { Textarea } from "../../../../plugin-support.js";
import type { ConversationCommandDecisionRequest, ConversationToolCallProps } from "../../../../public.js";

const ANIMATION_DURATION = 200;

const pressable = "active:scale-[0.98]";

export type ToolFallbackRootProps = Omit<
  React.ComponentProps<typeof Collapsible>,
  "open" | "onOpenChange"
> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
};

function ToolFallbackRoot({
  className,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  children,
  ...props
}: ToolFallbackRootProps) {
  const collapsibleRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      lockScroll();
      if (!isControlled) {
        setUncontrolledOpen(open);
      }
      controlledOnOpenChange?.(open);
    },
    [lockScroll, isControlled, controlledOnOpenChange],
  );

  return (
    <Collapsible
      ref={collapsibleRef}
      data-slot="tool-fallback-root"
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn(
        "aui-tool-fallback-root group/tool-fallback-root w-full",
        className,
      )}
      style={
        {
          "--animation-duration": `${ANIMATION_DURATION}ms`,
        } as React.CSSProperties
      }
      {...props}
    >
      {children}
    </Collapsible>
  );
}

type ToolStatus = ToolCallMessagePartStatus["type"];

// Resolve shared exports at render time; the support barrel also exposes
// response controls that import this presentation during module initialization.
const statusIcon = (status: ToolStatus): React.ElementType => ({
  running: LoaderIcon,
  complete: CheckIcon,
  incomplete: XCircleIcon,
  "requires-action": AlertCircleIcon,
})[status];

const formatToolDuration = (ms: number) => {
  if (ms < 1000) return "<1s";
  const seconds = ms / 1000;
  if (seconds < 10) return `${(Math.floor(seconds * 10) / 10).toFixed(1)}s`;
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
};

function ToolFallbackDuration({
  className,
  ...props
}: React.ComponentProps<"span">) {
  const elapsedMs = useToolCallElapsed();
  if (elapsedMs === undefined) return null;

  return (
    <span
      data-slot="tool-fallback-duration"
      className={cn(
        "aui-tool-fallback-duration text-muted-foreground text-xs tabular-nums",
        className,
      )}
      {...props}
    >
      {formatToolDuration(elapsedMs)}
    </span>
  );
}

function ToolFallbackTrigger({
  toolName,
  status,
  responseDeliveryStatus,
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger> & {
  toolName: string;
  status?: ToolCallMessagePartStatus;
  responseDeliveryStatus?: ToolCallMessagePart["responseDeliveryStatus"];
}) {
  const messages = useAgentUILocale("toolPresentation");
  const statusType = status?.type ?? "complete";
  const isRunning = statusType === "running";
  const isCancelled =
    status?.type === "incomplete" && status.reason === "cancelled";

  const Icon = statusIcon(statusType);
  const label =
    responseDeliveryStatus === "queued"
      ? messages.replyQueued
      : statusType === "running"
        ? messages.running
        : statusType === "requires-action"
          ? messages.waiting
          : statusType === "incomplete"
            ? (isCancelled ? messages.cancelled : messages.failed)
            : messages.used;

  return (
    <CollapsibleTrigger
      data-slot="tool-fallback-trigger"
      className={cn(
        "aui-tool-fallback-trigger group/trigger text-muted-foreground hover:text-foreground flex w-fit max-w-full origin-left items-center gap-2 py-1.5 text-sm transition-[color,scale] active:scale-[0.98]",
        className,
      )}
      {...props}
    >
      {children ?? <>
      <Icon
        data-slot="tool-fallback-trigger-icon"
        className={cn(
          "aui-tool-fallback-trigger-icon size-4 shrink-0",
          isCancelled && "text-muted-foreground",
          isRunning && "animate-spin [animation-duration:0.6s]",
        )}
      />
      <span
        data-slot="tool-fallback-trigger-label"
        className={cn(
          "aui-tool-fallback-trigger-label-wrapper inline-block min-w-0 text-start leading-none wrap-anywhere",
          isCancelled && "text-muted-foreground line-through",
          isRunning && "shimmer motion-reduce:animate-none",
        )}
      >
        {label}: <b>{toolName}</b>
      </span>
      <ToolFallbackDuration />
      <ChevronDownIcon
        data-slot="tool-fallback-trigger-chevron"
        className={cn(
          "aui-tool-fallback-trigger-chevron size-4 shrink-0",
          "transition-transform duration-(--animation-duration) ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          "-rotate-90",
          "group-data-open/trigger:rotate-0",
          "group-data-panel-open/trigger:rotate-0",
        )}
      />
      </>}
    </CollapsibleTrigger>
  );
}

function ToolFallbackContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="tool-fallback-content"
      className={cn(
        "aui-tool-fallback-content relative overflow-hidden text-sm outline-none",
        "group/collapsible-content ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none",
        "data-closed:animate-collapsible-up",
        "data-open:animate-collapsible-down",
        "data-closed:fill-mode-forwards",
        "data-closed:pointer-events-none",
        "[--tw-duration:var(--animation-duration)]",
        className,
      )}
      {...props}
    >
      <div data-agent-ui-owned=""
        className={cn(
          "flex flex-col gap-2 ps-6 pt-1 pb-2 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none",
          "group-data-open/collapsible-content:animate-in group-data-open/collapsible-content:fade-in-0 group-data-open/collapsible-content:blur-in-[2px] group-data-open/collapsible-content:slide-in-from-top-1",
          "group-data-closed/collapsible-content:animate-out group-data-closed/collapsible-content:fade-out-0 group-data-closed/collapsible-content:blur-out-[2px] group-data-closed/collapsible-content:slide-out-to-top-1",
          "group-data-closed/collapsible-content:animation-duration-(--animation-duration) group-data-open/collapsible-content:animation-duration-(--animation-duration)",
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  );
}

function ToolFallbackArgs({
  argsText,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  argsText?: string;
}) {
  if (!argsText) return null;

  return (
    <div
      data-slot="tool-fallback-args"
      className={cn("aui-tool-fallback-args", className)}
      {...props}
    >
      <pre className="aui-tool-fallback-args-value bg-muted/50 text-foreground/90 rounded-md p-2.5 text-xs break-words whitespace-pre-wrap">
        {argsText}
      </pre>
    </div>
  );
}

const formatUnknownValue = (value: unknown, space?: number): string => {
  if (typeof value === "string") return value;

  try {
    if (value instanceof Error) return String(value);

    const json = JSON.stringify(value, null, space);
    if (json !== undefined) return json;
  } catch {}

  try {
    return String(value);
  } catch {
    return "[Unserializable value]";
  }
};

function ToolFallbackResult({
  result,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  result?: unknown;
}) {
  const messages = useAgentUILocale("toolPresentation");
  if (result === undefined) return null;

  return (
    <div
      data-slot="tool-fallback-result"
      className={cn("aui-tool-fallback-result", className)}
      {...props}
    >
      <p className="aui-tool-fallback-result-header text-muted-foreground text-xs font-medium">
        {messages.result}
      </p>
      <pre className="aui-tool-fallback-result-content bg-muted/50 text-foreground/90 mt-1 rounded-md p-2.5 text-xs break-words whitespace-pre-wrap">
        {formatUnknownValue(result, 2)}
      </pre>
    </div>
  );
}

function ToolFallbackError({
  status,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  status?: ToolCallMessagePartStatus;
}) {
  const messages = useAgentUILocale("toolPresentation");
  if (status?.type !== "incomplete") return null;

  const error = status.error;
  const errorText =
    error === undefined || error === null ? null : formatUnknownValue(error);

  if (!errorText) return null;

  const isCancelled = status.reason === "cancelled";
  const headerText = isCancelled ? messages.cancelReason : messages.error;

  return (
    <div
      data-slot="tool-fallback-error"
      className={cn("aui-tool-fallback-error", className)}
      {...props}
    >
      <p className="aui-tool-fallback-error-header text-muted-foreground font-semibold">
        {headerText}
      </p>
      <p className="aui-tool-fallback-error-reason text-muted-foreground break-words whitespace-pre-line">
        {errorText}
      </p>
    </div>
  );
}

const APPROVED_RESULT = "Approved by user";
const DENIED_RESULT = "User denied tool execution";

const APPROVAL_OPTION_DEFAULT_LABELS: Record<string, string> = {
  "allow-once": "Allow",
  "allow-always": "Always allow",
  "reject-once": "Deny",
  "reject-always": "Always deny",
};

const isKnownKind = (kind: string) =>
  Object.hasOwn(APPROVAL_OPTION_DEFAULT_LABELS, kind);

const isAllowKind = (kind: string) =>
  kind === "allow-once" || kind === "allow-always";

const approvalOptionLabel = (option: ToolApprovalOption, messages = DEFAULT_AGENT_UI_MESSAGES.toolPresentation) =>
  option.label ??
  (isKnownKind(option.kind)
    ? ({ "allow-once": messages.allow, "allow-always": messages.alwaysAllow, "reject-once": messages.deny, "reject-always": messages.alwaysDeny } as Record<string, string>)[option.kind]
    : undefined) ??
  option.id;

/**
 * A request that declares how it wants to be presented is asking a question,
 * not gating an action, so a refusal is not one of the answers it accepts
 * unless the request declares itself dismissible.
 */
const isQuestion = (approval: ToolCallMessagePart["approval"]) =>
  approval?.display === "select" ||
  approval?.display === "text" ||
  approval?.display === "questions";

const questionAcceptsText = (question: ToolApprovalQuestion) =>
  !question.options?.length || question.allowFreeform === true;

const answerLabels = (
  question: ToolApprovalQuestion,
  answer: ToolApprovalAnswer | undefined,
) => [
  ...(answer?.optionIds ?? []).map(
    (id) => question.options?.find((option) => option.id === id)?.label ?? id,
  ),
  ...(answer?.text?.trim() ? [answer.text] : []),
];

const isSettled = (approval: ToolCallMessagePart["approval"]) =>
  approval != null &&
  (approval.approved !== undefined || approval.resolution !== undefined);

type ApprovalReceipt = {
  outcome: "allowed" | "refused" | "closed";
  label: string;
  option?: string | undefined;
};

/**
 * A settled request reads as a past-tense record of what happened to it, so
 * scrolling back never shows a live control for a decision already made.
 */
const approvalReceipt = (
  approval: NonNullable<ToolCallMessagePart["approval"]>,
  messages = DEFAULT_AGENT_UI_MESSAGES.toolPresentation,
): ApprovalReceipt => {
  if (approval.resolution !== undefined)
    return {
      outcome: "closed",
      label:
        approval.resolution === "cancelled"
          ? messages.cancelledDecision
          : messages.expiredDecision,
    };

  const chosen =
    approval.optionId === undefined
      ? undefined
      : approval.options?.find((option) => option.id === approval.optionId);
  const option =
    chosen !== undefined
      ? approvalOptionLabel(chosen, messages)
      : approval.optionId === undefined
        ? undefined
        : approval.optionId;
  const answered =
    isQuestion(approval) || (chosen !== undefined && !isKnownKind(chosen.kind));
  const automatic = approval.isAutomatic ? messages.automatic : "";

  if (approval.approved)
    return {
      outcome: "allowed",
      label: `${answered ? messages.answered : messages.allowed}${automatic}`,
      option,
    };
  return {
    outcome: "refused",
    label: `${answered ? messages.dismissed : messages.denied}${automatic}`,
    option,
  };
};

const receiptIcon = (outcome: ApprovalReceipt["outcome"]): React.ElementType => ({
  allowed: CheckIcon,
  refused: XCircleIcon,
  closed: CircleMinusIcon,
})[outcome];

function ToolFallbackApprovalReceipt({
  approval,
  className,
  focusReceiptRef,
  receiptRef,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  approval: NonNullable<ToolCallMessagePart["approval"]>;
  focusReceiptRef: React.MutableRefObject<string | null | undefined>;
  receiptRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  useLayoutEffect(() => {
    const shouldFocus = focusReceiptRef.current === approval.id;
    focusReceiptRef.current = null;
    if (shouldFocus) receiptRef.current?.focus({ preventScroll: true });
  }, [approval.id, focusReceiptRef, receiptRef]);

  const messages = useAgentUILocale("toolPresentation");
  const receipt = approvalReceipt(approval, messages);
  const Icon = receiptIcon(receipt.outcome);
  const notes = [
    ...new Set(
      [approval.text, approval.reason].filter(
        (value): value is string => typeof value === "string" && value !== "",
      ),
    ),
  ];

  return (
    <div
      ref={receiptRef}
      data-slot="tool-fallback-approval-receipt"
      data-outcome={receipt.outcome}
      tabIndex={-1}
      className={cn(
        "aui-tool-fallback-approval-receipt flex flex-col gap-1.5 pt-1",
        className,
      )}
      {...props}
    >
      {approval.prompt ? (
        <p className="aui-tool-fallback-approval-prompt text-muted-foreground whitespace-pre-line">
          {approval.prompt}
        </p>
      ) : null}
      <p className="aui-tool-fallback-approval-receipt-label flex items-center gap-1.5">
        <Icon aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
        <span data-agent-ui-owned="" className="font-medium">{receipt.label}</span>
        {receipt.option !== undefined ? (
          <span data-agent-ui-owned="" className="text-muted-foreground">· {receipt.option}</span>
        ) : null}
      </p>
      {approval.answers &&
        approval.questions?.map((question) => {
          const labels = answerLabels(
            question,
            approval.answers && Object.hasOwn(approval.answers, question.id)
              ? approval.answers[question.id]
              : undefined,
          );
          if (labels.length === 0) return null;
          return (
            <p
              key={question.id}
              className="aui-tool-fallback-approval-receipt-answer whitespace-pre-line"
            >
              <span data-agent-ui-owned="" className="text-muted-foreground">
                {question.header ?? question.prompt}
              </span>{" "}
              · {labels.join(", ")}
            </p>
          );
        })}
      {notes.map((text) => (
        <p
          key={text}
          className="aui-tool-fallback-approval-receipt-note text-muted-foreground whitespace-pre-line"
        >
          {text}
        </p>
      ))}
    </div>
  );
}

function ToolFallbackApprovalQuestions({
  questions,
  dismissible,
  locked,
  onSend,
  onDismiss,
}: {
  questions: readonly ToolApprovalQuestion[];
  dismissible: boolean;
  locked: boolean;
  onSend: (answers: Record<string, ToolApprovalAnswer>) => void;
  onDismiss: () => void;
}) {
  const messages = useAgentUILocale("toolPresentation");
  const [selected, setSelected] = useState<
    ReadonlyMap<string, readonly string[]>
  >(() => new Map());
  const [typed, setTyped] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );

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
    if (locked || !complete) return;
    onSend(
      Object.fromEntries(
        questions.map((question) => [question.id, answerOf(question)]),
      ),
    );
  };

  return (
    <>
      {questions.map((question) => {
        const chosen = selected.get(question.id) ?? [];
        const described =
          question.options?.some((option) => option.description) ?? false;
        return (
          <div
            key={question.id}
            role="group"
            aria-label={question.prompt}
            data-slot="tool-fallback-approval-question"
            className="aui-tool-fallback-approval-question flex flex-col gap-2"
          >
            <p className="aui-tool-fallback-approval-question-prompt text-foreground whitespace-pre-line">
              {question.header ? (
                <span data-agent-ui-owned="" className="text-muted-foreground me-1.5 text-xs font-medium uppercase">
                  {question.header}
                </span>
              ) : null}
              {question.prompt}
            </p>
            {question.options && question.options.length > 0 ? (
              <div data-agent-ui-owned=""
                className={cn(
                  "flex gap-2",
                  described
                    ? "flex-col items-stretch"
                    : "flex-wrap items-center",
                )}
              >
                {question.options.map((option) => {
                  const pressed = chosen.includes(option.id);
                  return (
                    <Button
                      key={option.id}
                      size="sm"
                      variant={pressed ? "default" : "outline"}
                      className={cn(
                        pressable,
                        described &&
                          "h-auto flex-col items-start gap-0.5 py-2 text-start whitespace-normal",
                      )}
                      aria-pressed={pressed}
                      onClick={() => toggle(question, option.id)}
                      disabled={locked}
                    >
                      <span data-agent-ui-owned="">{option.label}</span>
                      {option.description ? (
                        <span data-agent-ui-owned="" className="text-xs font-normal opacity-80">
                          {option.description}
                        </span>
                      ) : null}
                    </Button>
                  );
                })}
              </div>
            ) : null}
            {questionAcceptsText(question) ? (
              <Textarea
                value={typed.get(question.id) ?? ""}
                onChange={(event) =>
                  setTyped((current) =>
                    new Map(current).set(question.id, event.target.value),
                  )
                }
                disabled={locked}
                aria-label={question.prompt}
                placeholder={
                  question.options?.length
                    ? messages.alternativeAnswerPlaceholder
                    : messages.answerPlaceholder
                }
              />
            ) : null}
          </div>
        );
      })}
      <div data-agent-ui-owned="" className="flex items-center gap-2">
        <Button
          size="sm"
          className={pressable}
          onClick={send}
          disabled={locked || !complete}
        >
          {messages.send}
        </Button>
        {dismissible ? (
          <Button
            size="sm"
            variant="outline"
            className={pressable}
            onClick={onDismiss}
            disabled={locked}
          >
            {messages.dismiss}
          </Button>
        ) : null}
      </div>
    </>
  );
}

const offersInterruptAction = (
  status: ToolCallMessagePartStatus | undefined,
  approval: ToolCallMessagePart["approval"],
  interrupt: ToolCallMessagePart["interrupt"],
  decisionRequest?: ConversationCommandDecisionRequest,
) =>
  decisionRequest !== undefined ||
  status?.type !== "requires-action" ||
  status.reason !== "interrupt" ||
  approval != null ||
  interrupt != null;

type ToolFallbackApprovalProps = React.ComponentPropsWithoutRef<"div"> &
  Partial<
    Pick<
      ToolCallMessagePartProps,
      "addResult" | "resume" | "respondToApproval" | "status"
    >
  > & {
    interrupt?: ToolCallMessagePart["interrupt"];
    approval?: ToolCallMessagePart["approval"];
    decisionRequest?: ConversationCommandDecisionRequest | undefined;
    submitDecision?: ConversationToolCallProps["submitDecision"] | undefined;
  };

const ToolFallbackApproval: React.ForwardRefExoticComponent<ToolFallbackApprovalProps & React.RefAttributes<HTMLDivElement>> = forwardRef<
  HTMLDivElement,
  ToolFallbackApprovalProps
>(function ToolFallbackApproval(props, ref) {
  const carryFocusRef = useRef(false);
  return (
    <ToolFallbackApprovalImpl
      key={props.approval?.id}
      carryFocusRef={carryFocusRef}
      forwardedRef={ref}
      {...props}
    />
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
  ...props
}: Omit<ToolFallbackApprovalProps, "ref"> & {
  forwardedRef: React.ForwardedRef<HTMLDivElement>;
  carryFocusRef: React.MutableRefObject<boolean>;
}) {
  const messages = useAgentUILocale("toolPresentation");
  const [submitted, setSubmitted] = useState(false);
  const voiceActive = useAuiState((s) => s.thread.voice !== undefined);
  const canAnswer = useAuiState((s) => s.thread.capabilities.answerToolCall);
  const locked = submitted || voiceActive;
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isRequiresAction = status?.type === "requires-action";
  const [prevRequiresAction, setPrevRequiresAction] =
    useState(isRequiresAction);
  const [attempt, setAttempt] = useState(0);
  const attemptRef = useRef(attempt);
  useLayoutEffect(() => {
    attemptRef.current = attempt;
  }, [attempt]);
  if (isRequiresAction !== prevRequiresAction) {
    setPrevRequiresAction(isRequiresAction);
    if (isRequiresAction) {
      setSubmitted(false);
      setConfirmingId(null);
      setAnswer("");
      setError(null);
      setAttempt(attempt + 1);
    }
  }
  const pendingGroupRef = useRef<HTMLDivElement | null>(null);
  const receiptRef = useRef<HTMLDivElement | null>(null);
  const focusReceiptRef = useRef<string | null | undefined>(null);
  useLayoutEffect(() => {
    if (carryFocusRef.current) {
      carryFocusRef.current = false;
      pendingGroupRef.current?.focus({ preventScroll: true });
    }
    return () => {
      const element = pendingGroupRef.current ?? receiptRef.current;
      carryFocusRef.current =
        element?.contains(element.ownerDocument.activeElement) ?? false;
    };
  }, [carryFocusRef]);
  useImperativeHandle<HTMLDivElement | null, HTMLDivElement | null>(
    forwardedRef,
    () => pendingGroupRef.current ?? receiptRef.current,
  );
  const setPendingGroup = useCallback(
    (element: HTMLDivElement | null) => {
      const group = pendingGroupRef.current;
      focusReceiptRef.current =
        !element && group?.contains(group.ownerDocument.activeElement)
          ? approval?.id
          : null;
      pendingGroupRef.current = element;
    },
    [approval?.id],
  );
  const hidePendingApproval =
    approval != null &&
    !isSettled(approval) &&
    status !== undefined &&
    status.type !== "requires-action" &&
    !(submitted && status.type === "running");
  useLayoutEffect(() => {
    if (hidePendingApproval) focusReceiptRef.current = null;
  }, [hidePendingApproval]);
  const focusPendingGroup = () => {
    const group = pendingGroupRef.current;
    if (group?.contains(group.ownerDocument.activeElement)) {
      group.focus({ preventScroll: true });
    }
  };

  if (approval != null && isSettled(approval))
    return (
      <ToolFallbackApprovalReceipt
        approval={approval}
        receiptRef={receiptRef}
        focusReceiptRef={focusReceiptRef}
        className={className}
        {...props}
      />
    );

  if (
    hidePendingApproval ||
    !offersInterruptAction(status, approval, interrupt, decisionRequest)
  )
    return null;

  const promptText = approval?.prompt ? (
    <p className="aui-tool-fallback-approval-prompt text-foreground whitespace-pre-line">
      {approval.prompt}
    </p>
  ) : decisionRequest?.description ? (
    <p className="aui-tool-fallback-approval-prompt text-foreground whitespace-pre-line">
      {decisionRequest.description}
    </p>
  ) : null;

  if (!canAnswer)
    return (
      promptText && (
        <div
          data-slot="tool-fallback-approval"
          tabIndex={-1}
          className={cn(
            "aui-tool-fallback-approval flex flex-col gap-2 pt-1",
            className,
          )}
          {...props}
          ref={setPendingGroup}
        >
          {promptText}
        </div>
      )
    );

  // A declared option list is a host constraint: the kit never adds an
  // approval path beyond it, and preserves a refusal path only where the
  // request is an action the user may refuse.
  const declaredOptions = respondToApproval ? approval?.options : undefined;
  const acceptsText =
    approval != null &&
    respondToApproval != null &&
    toolApprovalAcceptsText(approval);

  // A refused response leaves the request open, so the controls come back
  // rather than staying spent on a decision the runtime never recorded.
  const submit = (send: () => Promise<void> | void) => {
    focusPendingGroup();
    setSubmitted(true);
    setConfirmingId(null);
    setError(null);
    void (async () => {
      try {
        await send();
      } catch (sendError) {
        if (attemptRef.current !== attempt) return;
        setSubmitted(false);
        setError(
          sendError instanceof Error ? sendError.message : String(sendError),
        );
      }
    })();
  };

  const respond = (approved: boolean) => {
    if (locked) return;
    if (
      approval != null &&
      approval.approved === undefined &&
      respondToApproval
    ) {
      submit(() => respondToApproval({ approved, ...typedNote() }));
    } else if (interrupt) {
      submit(() => resume?.({ approved }));
    } else if (
      status?.type === "requires-action" &&
      status.reason === "interrupt"
    ) {
      return;
    } else {
      submit(() => addResult?.(approved ? APPROVED_RESULT : DENIED_RESULT));
    }
  };

  const respondWithOption = (option: ToolApprovalOption) => {
    if (locked) return;
    // A custom kind has no decision class for the runtime to derive, and
    // responding without one throws; picking a declared option is an answer,
    // so it resolves as approved.
    submit(() =>
      respondToApproval?.(
        isKnownKind(option.kind)
          ? { optionId: option.id, ...typedNote() }
          : { optionId: option.id, approved: true, ...typedNote() },
      ),
    );
  };

  const typedNote = () => (answer.trim() ? { text: answer } : {});

  // The kit does not validate an answer the request never constrained: a host
  // that cannot record an empty one rejects it, which reopens the controls.
  const submitAnswer = () => {
    if (locked) return;
    submit(() => respondToApproval?.({ text: answer }));
  };

  // A dismissal is no answer at all, so a typed draft does not travel with it.
  const dismiss = () => {
    if (locked) return;
    submit(() => respondToApproval?.({ approved: false }));
  };

  const handleOption = (option: ToolApprovalOption) => {
    if (option.confirm) {
      focusPendingGroup();
      setConfirmingId(option.id);
    } else {
      respondWithOption(option);
    }
  };

  const confirming =
    confirmingId != null
      ? declaredOptions?.find((o) => o.id === confirmingId)
      : undefined;

  const question = isQuestion(approval);
  const dismissible =
    question && respondToApproval != null && approval?.dismissible === true;

  const dismissButton = dismissible ? (
    <Button
      size="sm"
      variant="outline"
      className={pressable}
      onClick={dismiss}
      disabled={locked}
    >
      {messages.dismiss}
    </Button>
  ) : null;

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
          "aui-tool-fallback-approval flex flex-col gap-2 pt-1",
          className,
        )}
        {...props}
        ref={setPendingGroup}
      >
        {promptText}
        <div data-agent-ui-owned="" className="flex flex-wrap items-center gap-2">
          {decisionRequest.allowedDecisions.map((decisionType, index) => (
            <Button
              key={`${decisionType}:${index}`}
              size="sm"
              variant="outline"
              className={pressable}
              onClick={() => submit(() => submitDecision?.(decisionType))}
              disabled={locked || submitDecision === undefined}
            >
              {decisionType}
            </Button>
          ))}
        </div>
        {errorText}
      </div>
    );
  }

  const answerField = acceptsText ? (
    <div className="aui-tool-fallback-approval-answer flex flex-col items-start gap-2">
      <Textarea
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        disabled={locked}
        aria-label={question ? (approval?.prompt ?? messages.answer) : messages.note}
        placeholder={
          question ? messages.answerPlaceholder : messages.notePlaceholder
        }
      />
      {question && (
        <div data-agent-ui-owned="" className="flex items-center gap-2">
          <Button
            size="sm"
            className={pressable}
            onClick={submitAnswer}
            disabled={locked}
          >
            {messages.send}
          </Button>
          {dismissButton}
        </div>
      )}
    </div>
  ) : null;

  if (approval?.display === "questions" && respondToApproval) {
    return (
      <div
        data-slot="tool-fallback-approval"
        tabIndex={-1}
        className={cn(
          "aui-tool-fallback-approval flex flex-col gap-3 pt-1",
          className,
        )}
        {...props}
        ref={setPendingGroup}
      >
        {promptText}
        <ToolFallbackApprovalQuestions
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
    const confirmMeta =
      typeof confirming.confirm === "object" ? confirming.confirm : undefined;
    const confirmDescription =
      confirmMeta?.description ?? confirming.description;
    return (
      <div
        data-slot="tool-fallback-approval-confirm"
        tabIndex={-1}
        className={cn(
          "aui-tool-fallback-approval-confirm flex flex-col gap-2 pt-1",
          className,
        )}
        {...props}
        ref={setPendingGroup}
      >
        <p className="aui-tool-fallback-approval-confirm-title font-semibold">
          {confirmMeta?.title ?? `${approvalOptionLabel(confirming, messages)}?`}
        </p>
        {confirmDescription && (
          <p className="aui-tool-fallback-approval-confirm-description text-muted-foreground whitespace-pre-line">
            {confirmDescription}
          </p>
        )}
        {confirming.grants && confirming.grants.length > 0 && (
          <ul className="aui-tool-fallback-approval-confirm-grants flex flex-col gap-1">
            {confirming.grants.map((grant) => (
              <li data-agent-ui-owned="" key={grant}>
                <code className="aui-tool-fallback-approval-confirm-grant bg-muted rounded px-1.5 py-0.5 text-xs">
                  {grant}
                </code>
              </li>
            ))}
          </ul>
        )}
        <div data-agent-ui-owned="" className="flex items-center gap-2">
          <Button
            size="sm"
            className={pressable}
            onClick={() => respondWithOption(confirming)}
            disabled={locked}
          >
            {messages.confirm}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={pressable}
            onClick={() => {
              focusPendingGroup();
              setConfirmingId(null);
            }}
            disabled={locked}
          >
            {messages.back}
          </Button>
        </div>
      </div>
    );
  }

  if (declaredOptions && declaredOptions.length > 0) {
    const allowOptions = declaredOptions.filter((o) => isAllowKind(o.kind));
    const customOptions = declaredOptions.filter((o) => !isKnownKind(o.kind));
    const rejectOptions = declaredOptions.filter(
      (o) => isKnownKind(o.kind) && !isAllowKind(o.kind),
    );
    return (
      <div
        data-slot="tool-fallback-approval"
        tabIndex={-1}
        className={cn(
          "aui-tool-fallback-approval flex flex-col gap-2 pt-1",
          className,
        )}
        {...props}
        ref={setPendingGroup}
      >
        {promptText}
        <div data-agent-ui-owned="" className="flex flex-wrap items-center gap-2">
          {[...allowOptions, ...customOptions, ...rejectOptions].map(
            (option) => (
              <Button
                key={option.id}
                size="sm"
                variant={option === allowOptions[0] ? "default" : "outline"}
                className={pressable}
                onClick={() => handleOption(option)}
                disabled={locked}
              >
                {approvalOptionLabel(option, messages)}
              </Button>
            ),
          )}
          {rejectOptions.length === 0 && !question && (
            <Button
              size="sm"
              variant="outline"
              className={pressable}
              onClick={() => respond(false)}
              disabled={locked}
            >
              {messages.deny}
            </Button>
          )}
          {!acceptsText && dismissButton}
        </div>
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
        data-slot="tool-fallback-approval"
        tabIndex={-1}
        className={cn(
          "aui-tool-fallback-approval flex flex-col gap-2 pt-1",
          className,
        )}
        {...props}
        ref={setPendingGroup}
      >
        {promptText}
        {answerField}
        {!acceptsText && dismissButton && (
          <div data-agent-ui-owned="" className="flex items-center gap-2">{dismissButton}</div>
        )}
        {errorText}
      </div>
    );
  }

  return (
    <div
      data-slot="tool-fallback-approval"
      tabIndex={-1}
      className={cn(
        "aui-tool-fallback-approval flex flex-col gap-2 pt-1",
        className,
      )}
      {...props}
      ref={setPendingGroup}
    >
      {promptText}
      <div data-agent-ui-owned="" className="flex items-center gap-2">
        <Button
          size="sm"
          className={pressable}
          onClick={() => respond(true)}
          disabled={locked}
        >
          {messages.allow}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={pressable}
          onClick={() => respond(false)}
          disabled={locked}
        >
          {messages.deny}
        </Button>
      </div>
      {answerField}
      {errorText}
    </div>
  );
}

export interface ToolFallbackPresentationProps {
  rootProps?: ToolFallbackRootProps;
  triggerProps?: Omit<React.ComponentProps<typeof ToolFallbackTrigger>, "toolName" | "status" | "responseDeliveryStatus">;
  contentProps?: React.ComponentProps<typeof ToolFallbackContent>;
  argsProps?: Omit<React.ComponentProps<typeof ToolFallbackArgs>, "argsText" | "children">;
  resultProps?: Omit<React.ComponentProps<typeof ToolFallbackResult>, "result" | "children">;
  errorProps?: Omit<React.ComponentProps<typeof ToolFallbackError>, "status" | "children">;
  approvalProps?: Omit<React.ComponentPropsWithoutRef<"div">, "children">;
  children?: React.ReactNode;
}
type ToolFallbackProps = React.ComponentProps<ToolCallMessagePartComponent> &
  Pick<ConversationToolCallProps, "decisionRequest" | "submitDecision"> &
  ToolFallbackPresentationProps;

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
  rootProps, triggerProps, contentProps, argsProps, resultProps, errorProps, approvalProps, children,
}) => {
  const isCancelled =
    status?.type === "incomplete" && status.reason === "cancelled";
  const isRequiresAction = status?.type === "requires-action";
  const shouldRenderApproval =
    approval != null ||
    decisionRequest != null ||
    (isRequiresAction && offersInterruptAction(status, approval, interrupt, decisionRequest));

  const [open, setOpen] = useState(rootProps?.defaultOpen ?? isRequiresAction);
  const [prevRequiresAction, setPrevRequiresAction] =
    useState(isRequiresAction);
  if (isRequiresAction !== prevRequiresAction) {
    setPrevRequiresAction(isRequiresAction);
    if (isRequiresAction) setOpen(true);
  }
  const approvalHadFocusRef = useRef(false);
  const approvalElementRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    const focusedElement = approvalElementRef.current;
    if (
      !focusedElement ||
      focusedElement.isConnected ||
      isRequiresAction ||
      !approvalHadFocusRef.current
    ) {
      return;
    }

    const shouldFocusTrigger = approval == null || !isSettled(approval);
    approvalHadFocusRef.current = false;
    const { activeElement, body } = focusedElement.ownerDocument;
    if (
      shouldFocusTrigger &&
      (activeElement == null || activeElement === body)
    ) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [approval, isRequiresAction, status?.type]);

  return (
    <ToolFallbackRoot {...rootProps} open={rootProps?.open ?? open} onOpenChange={(value) => { setOpen(value); rootProps?.onOpenChange?.(value); }}>
      {rootProps?.children ?? <>
      <ToolFallbackTrigger
        toolName={toolName}
        status={status}
        responseDeliveryStatus={responseDeliveryStatus}
        {...triggerProps}
      />
      <ToolFallbackContent {...contentProps}>
        {contentProps?.children ?? <>
        <ToolFallbackError status={status} {...errorProps} />
        <ToolFallbackArgs
          argsText={argsText}
          className={cn(isCancelled && "opacity-60")}
          {...argsProps}
        />
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
            onFocusCapture={(event) => {
              approvalProps?.onFocusCapture?.(event);
              const root = event.currentTarget.closest(
                '[data-slot="tool-fallback-root"]',
              );
              triggerRef.current =
                root?.querySelector<HTMLButtonElement>(
                  '[data-slot="tool-fallback-trigger"]',
                ) ?? null;
              approvalElementRef.current = event.currentTarget;
              approvalHadFocusRef.current = true;
            }}
            onBlurCapture={(event) => {
              approvalProps?.onBlurCapture?.(event);
              const relatedTarget = event.relatedTarget;
              const stillFocused = relatedTarget
                ? event.currentTarget.contains(relatedTarget as Node)
                : event.currentTarget.contains(
                    event.currentTarget.ownerDocument.activeElement,
                  );
              if (!stillFocused) approvalHadFocusRef.current = false;
            }}
          />
        )}
        <ToolFallbackResult result={result} {...resultProps} />
        {children}
        </>}
      </ToolFallbackContent>
      </>}
    </ToolFallbackRoot>
  );
};

const ToolFallback = memo(
  ToolFallbackImpl,
) as unknown as React.FC<ToolFallbackProps> & {
  Root: typeof ToolFallbackRoot;
  Trigger: typeof ToolFallbackTrigger;
  Content: typeof ToolFallbackContent;
  Args: typeof ToolFallbackArgs;
  Result: typeof ToolFallbackResult;
  Error: typeof ToolFallbackError;
  Approval: typeof ToolFallbackApproval;
};

ToolFallback.displayName = "ToolFallback";
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
  ToolFallbackRoot,
  ToolFallbackTrigger,
  ToolFallbackContent,
  ToolFallbackArgs,
  ToolFallbackResult,
  ToolFallbackError,
  ToolFallbackApproval,
};

export type ConversationToolFallbackProps = Readonly<ConversationToolCallProps> & ToolFallbackPresentationProps & Partial<Pick<ToolCallMessagePartProps, "approval" | "respondToApproval" | "interrupt" | "resume" | "responseDeliveryStatus">>;
export const ConversationToolFallback: React.FC<ConversationToolFallbackProps> & Pick<typeof ToolFallback, "Root" | "Trigger" | "Content" | "Args" | "Result" | "Error" | "Approval"> = Object.assign(function ConversationToolFallback(props: ConversationToolFallbackProps) {
  return <ToolFallback {...(props as unknown as React.ComponentProps<typeof ToolFallback>)} />;
}, { Root: ToolFallback.Root, Trigger: ToolFallback.Trigger, Content: ToolFallback.Content, Args: ToolFallback.Args, Result: ToolFallback.Result, Error: ToolFallback.Error, Approval: ToolFallback.Approval });
