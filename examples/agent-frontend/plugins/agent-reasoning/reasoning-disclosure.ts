import { useCallback, useLayoutEffect, useRef, useState } from "react";

import type { AgentReasoningStatus } from "../../agent-ui/components/reasoning";

interface ReasoningDisclosureState {
  messageId: string;
  initialOpen: boolean;
  userOpen: boolean | null;
}

interface PreviousDisclosureSnapshot {
  messageId: string;
  expanded: boolean;
}

export interface ReasoningDisclosureOptions {
  messageId: string;
  streaming: boolean;
  status: AgentReasoningStatus;
  defaultExpanded: boolean;
  onAutomaticAnimationStart?(): void;
}

export interface ReasoningDisclosureBinding {
  expanded: boolean;
  onExpandedChange(expanded: boolean): void;
}

export function useReasoningDisclosure({
  messageId,
  streaming,
  status,
  defaultExpanded,
  onAutomaticAnimationStart,
}: ReasoningDisclosureOptions): ReasoningDisclosureBinding {
  const [state, setState] = useState<ReasoningDisclosureState>(() => ({
    messageId,
    initialOpen: defaultExpanded,
    userOpen: null,
  }));
  const currentState = state.messageId === messageId
    ? state
    : {
        messageId,
        initialOpen: defaultExpanded,
        userOpen: null,
      };
  const previousRef = useRef<PreviousDisclosureSnapshot>({
    messageId,
    expanded: streaming || defaultExpanded,
  });
  const manualChangeRef = useRef(false);

  const expanded = currentState.userOpen
    ?? (status === "interrupted" && previousRef.current.messageId === messageId
      ? previousRef.current.expanded
      : streaming || currentState.initialOpen);

  const onExpandedChange = useCallback((nextExpanded: boolean) => {
    manualChangeRef.current = true;
    setState((previousState) => {
      const stateForMessage = previousState.messageId === messageId
        ? previousState
        : {
            messageId,
            initialOpen: defaultExpanded,
            userOpen: null,
          };
      return { ...stateForMessage, userOpen: nextExpanded };
    });
  }, [defaultExpanded, messageId]);

  useLayoutEffect(() => {
    if (state.messageId !== messageId) {
      setState(currentState);
    }

    const previous = previousRef.current;
    if (previous.messageId === messageId && previous.expanded !== expanded) {
      if (manualChangeRef.current) {
        manualChangeRef.current = false;
      } else {
        onAutomaticAnimationStart?.();
      }
    } else {
      manualChangeRef.current = false;
    }
    previousRef.current = { messageId, expanded };
  }, [currentState, expanded, messageId, onAutomaticAnimationStart, state.messageId]);

  return {
    expanded,
    onExpandedChange,
  };
}
