import { useCallback, useEffect, useRef, useState } from "react";

import type { AgentReasoningStatus } from "../../agent-ui/components/reasoning";

export const DEFAULT_REASONING_COLLAPSE_DELAY_MS = 1_000;

export function resolveReasoningCollapseDelayMs(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : DEFAULT_REASONING_COLLAPSE_DELAY_MS;
}

export interface ReasoningDisclosureOptions {
  messageId: string;
  running: boolean;
  status: AgentReasoningStatus;
  defaultExpanded: boolean;
  collapseOnComplete: boolean;
  collapseDelayMs: number;
}

export interface ReasoningDisclosureBinding {
  expanded: boolean;
  onExpandedChange(expanded: boolean): void;
}

export function useReasoningDisclosure({
  messageId,
  running,
  status,
  defaultExpanded,
  collapseOnComplete,
  collapseDelayMs,
}: ReasoningDisclosureOptions): ReasoningDisclosureBinding {
  const [expanded, setExpanded] = useState(
    () => running || defaultExpanded,
  );
  const expandedRef = useRef(expanded);
  const previousMessageIdRef = useRef(messageId);
  const previousRunningRef = useRef(running);
  const collapseTimerRef = useRef<number | undefined>(undefined);

  const clearPendingCollapse = useCallback(() => {
    if (collapseTimerRef.current === undefined) {
      return;
    }

    window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = undefined;
  }, []);

  const updateExpanded = useCallback((nextExpanded: boolean) => {
    expandedRef.current = nextExpanded;
    setExpanded(nextExpanded);
  }, []);

  const onExpandedChange = useCallback(
    (nextExpanded: boolean) => {
      clearPendingCollapse();
      updateExpanded(nextExpanded);
    },
    [clearPendingCollapse, updateExpanded],
  );

  useEffect(() => {
    return () => clearPendingCollapse();
  }, [clearPendingCollapse]);

  useEffect(() => {
    if (previousMessageIdRef.current !== messageId) {
      clearPendingCollapse();
      previousMessageIdRef.current = messageId;
      previousRunningRef.current = running;
      updateExpanded(running || defaultExpanded);
      return;
    }

    const wasRunning = previousRunningRef.current;
    previousRunningRef.current = running;

    if (!wasRunning && running) {
      clearPendingCollapse();
      updateExpanded(true);
      return;
    }

    if (status === "interrupted") {
      clearPendingCollapse();
      return;
    }

    if (
      !wasRunning ||
      running ||
      status !== "completed" ||
      !collapseOnComplete
    ) {
      return;
    }

    clearPendingCollapse();
    if (collapseDelayMs === 0) {
      updateExpanded(false);
      return;
    }

    collapseTimerRef.current = window.setTimeout(() => {
      collapseTimerRef.current = undefined;
      if (expandedRef.current) {
        updateExpanded(false);
      }
    }, collapseDelayMs);
  }, [
    clearPendingCollapse,
    collapseDelayMs,
    collapseOnComplete,
    defaultExpanded,
    messageId,
    running,
    status,
    updateExpanded,
  ]);

  return {
    expanded,
    onExpandedChange,
  };
}
