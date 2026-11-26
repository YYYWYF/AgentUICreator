'use client';

import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  useLocale,
  useAuiState,
  type ToolApprovalOption,
} from '../../../../../plugin-support.js';
import {
  APPROVED_RESULT,
  DENIED_RESULT,
  isKnownKind,
  isSettled,
  type ToolFallbackApprovalProps,
} from './approval-model.js';

type ApprovalInteractionProps = {
  [Key in
    | 'addResult'
    | 'resume'
    | 'interrupt'
    | 'approval'
    | 'respondToApproval'
    | 'status']: ToolFallbackApprovalProps[Key];
} & {
  forwardedRef: React.ForwardedRef<HTMLDivElement>;
  carryFocusRef: React.MutableRefObject<boolean>;
};

export function useApprovalInteraction({
  addResult,
  resume,
  resumeInterrupt,
  tool,
  interrupt,
  approval,
  respondToApproval,
  status,
  forwardedRef,
  carryFocusRef,
}: ApprovalInteractionProps &
  Pick<ToolFallbackApprovalProps, 'resumeInterrupt' | 'tool'>) {
  const messages = useLocale('toolPresentation');
  const [submitted, setSubmitted] = useState(false);
  const submittedRef = useRef(false);
  const voiceActive = useAuiState((s) => s.thread.voice !== undefined);
  const canAnswer = useAuiState((s) => s.thread.capabilities.answerToolCall);
  const locked = submitted || voiceActive;
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isRequiresAction = status?.type === 'requires-action';
  const available = useRef({ canAnswer, voiceActive, isRequiresAction });
  available.current = { canAnswer, voiceActive, isRequiresAction };
  const [prevRequiresAction, setPrevRequiresAction] =
    useState(isRequiresAction);
  const identity = JSON.stringify([tool?.toolCallId, approval?.id]);
  const [previousIdentity, setPreviousIdentity] = useState(identity);
  const [attempt, setAttempt] = useState(0);
  const attemptRef = useRef(attempt);
  useLayoutEffect(() => {
    attemptRef.current = attempt;
  }, [attempt]);
  if (
    isRequiresAction !== prevRequiresAction ||
    identity !== previousIdentity
  ) {
    setPrevRequiresAction(isRequiresAction);
    setPreviousIdentity(identity);
    if (isRequiresAction) {
      submittedRef.current = false;
      setSubmitted(false);
      setConfirmingId(null);
      setAnswer('');
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
    status.type !== 'requires-action' &&
    !(submitted && status.type === 'running');
  useLayoutEffect(() => {
    if (hidePendingApproval) {
      focusReceiptRef.current = null;
    }
  }, [hidePendingApproval]);
  const focusPendingGroup = () => {
    const group = pendingGroupRef.current;
    if (group?.contains(group.ownerDocument.activeElement)) {
      group.focus({ preventScroll: true });
    }
  };

  // Preserve the host's approval choices and the existing refusal path.
  const declaredOptions = respondToApproval ? approval?.options : undefined;
  const acceptsText =
    respondToApproval != null && approval?.allowFreeform === true;

  // A refused response leaves the request open, so the controls come back
  // rather than staying spent on a decision the runtime never recorded.
  const submit = async (send: () => Promise<void> | void): Promise<void> => {
    if (
      !available.current.canAnswer ||
      available.current.voiceActive ||
      !available.current.isRequiresAction ||
      attemptRef.current !== attempt ||
      locked ||
      submittedRef.current
    ) {
      return;
    }
    submittedRef.current = true;
    focusPendingGroup();
    setSubmitted(true);
    setConfirmingId(null);
    setError(null);
    try {
      await send();
    } catch (sendError) {
      if (attemptRef.current !== attempt) throw sendError;
      submittedRef.current = false;
      setSubmitted(false);
      setError(
        sendError instanceof Error ? sendError.message : String(sendError),
      );
      throw sendError;
    }
  };

  const respond = (approved: boolean) => {
    if (locked) {
      return;
    }
    if (
      approval != null &&
      approval.approved === undefined &&
      respondToApproval
    ) {
      void submit(() => respondToApproval({ approved, ...typedNote() })).catch(
        () => {},
      );
    } else if (interrupt) {
      void submit(() =>
        resume ? resume({ approved }) : resumeInterrupt?.({ approved }),
      ).catch(() => {});
    } else if (
      status?.type === 'requires-action' &&
      status.reason === 'interrupt'
    ) {
      return;
    } else {
      void submit(() =>
        addResult?.(approved ? APPROVED_RESULT : DENIED_RESULT),
      ).catch(() => {});
    }
  };

  const respondWithOption = (option: ToolApprovalOption) => {
    if (locked) {
      return;
    }
    // A custom kind has no decision class for the runtime to derive, and
    // responding without one throws; picking a declared option is an answer,
    // so it resolves as approved.
    void submit(() =>
      respondToApproval?.(
        isKnownKind(option.kind)
          ? { optionId: option.id, ...typedNote() }
          : { optionId: option.id, approved: true, ...typedNote() },
      ),
    ).catch(() => {});
  };

  const typedNote = () => (answer.trim() ? { text: answer } : {});

  const handleOption = (option: ToolApprovalOption) => {
    if (!canAnswer || locked || submittedRef.current) {
      return;
    }
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

  return {
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
    respondWithOption,
    handleOption,
    confirming,
  };
}
