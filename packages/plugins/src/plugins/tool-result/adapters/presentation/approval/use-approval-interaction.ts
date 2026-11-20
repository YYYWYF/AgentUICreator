'use client';

import { useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import {
  useLocale,
  useAuiState,
  toolApprovalAcceptsText,
  type ToolApprovalOption,
} from '../../../../../plugin-support.js';
import {
  APPROVED_RESULT,
  DENIED_RESULT,
  isKnownKind,
  isQuestion,
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
  interrupt,
  approval,
  respondToApproval,
  status,
  forwardedRef,
  carryFocusRef,
}: ApprovalInteractionProps) {
  const messages = useLocale('toolPresentation');
  const [submitted, setSubmitted] = useState(false);
  const voiceActive = useAuiState((s) => s.thread.voice !== undefined);
  const canAnswer = useAuiState((s) => s.thread.capabilities.answerToolCall);
  const locked = submitted || voiceActive;
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isRequiresAction = status?.type === 'requires-action';
  const [prevRequiresAction, setPrevRequiresAction] = useState(isRequiresAction);
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
      carryFocusRef.current = element?.contains(element.ownerDocument.activeElement) ?? false;
    };
  }, [carryFocusRef]);
  useImperativeHandle<HTMLDivElement | null, HTMLDivElement | null>(
    forwardedRef,
    () => pendingGroupRef.current ?? receiptRef.current,
  );
  const setPendingGroup = useCallback(
    (element: HTMLDivElement | null) => {
      const group = pendingGroupRef.current;
      focusReceiptRef.current = !element && group?.contains(group.ownerDocument.activeElement) ? approval?.id : null;
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

  // A declared option list is a host constraint: the kit never adds an
  // approval path beyond it, and preserves a refusal path only where the
  // request is an action the user may refuse.
  const declaredOptions = respondToApproval ? approval?.options : undefined;
  const acceptsText = approval != null && respondToApproval != null && toolApprovalAcceptsText(approval);

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
        if (attemptRef.current !== attempt) {
          return;
        }
        setSubmitted(false);
        setError(sendError instanceof Error ? sendError.message : String(sendError));
      }
    })();
  };

  const respond = (approved: boolean) => {
    if (locked) {
      return;
    }
    if (approval != null && approval.approved === undefined && respondToApproval) {
      submit(() => respondToApproval({ approved, ...typedNote() }));
    } else if (interrupt) {
      submit(() => resume?.({ approved }));
    } else if (status?.type === 'requires-action' && status.reason === 'interrupt') {
      return;
    } else {
      submit(() => addResult?.(approved ? APPROVED_RESULT : DENIED_RESULT));
    }
  };

  const respondWithOption = (option: ToolApprovalOption) => {
    if (locked) {
      return;
    }
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
    if (locked) {
      return;
    }
    submit(() => respondToApproval?.({ text: answer }));
  };

  // A dismissal is no answer at all, so a typed draft does not travel with it.
  const dismiss = () => {
    if (locked) {
      return;
    }
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

  const confirming = confirmingId != null ? declaredOptions?.find((o) => o.id === confirmingId) : undefined;

  const question = isQuestion(approval);
  const dismissible = question && respondToApproval != null && approval?.dismissible === true;

  return {
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
    respondWithOption,
    submitAnswer,
    dismiss,
    handleOption,
    confirming,
    question,
    dismissible,
  };
}
