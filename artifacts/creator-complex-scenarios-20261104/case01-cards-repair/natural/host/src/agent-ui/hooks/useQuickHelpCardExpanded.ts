import { createContext, useContext, useSyncExternalStore } from "react";

/**
 * Per-card expansion state for the quick help cards.
 *
 * The same card Plugin identity is composed more than once, and the card itself
 * plus the actions placed in its `headerActions` slot are separate Plugin
 * instances. The state therefore lives in one tiny project-owned store outside
 * React, keyed by the card instance id, so every card collapses on its own.
 * The card publishes its id through `QuickHelpCardInstanceIdContext`; header
 * actions read that id to know which card they dismiss. Theme switching only
 * re-renders the tree, the module (and therefore this state) keeps its values.
 */
const DEFAULT_EXPANDED = true;
const expandedByCard = new Map<string, boolean>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Read the expansion state of one card outside React. */
export function getQuickHelpCardExpanded(cardId: string | null): boolean {
  return expandedByCard.get(cardId ?? "") ?? DEFAULT_EXPANDED;
}

export function setQuickHelpCardExpanded(
  cardId: string | null,
  next: boolean,
): void {
  const key = cardId ?? "";
  if (getQuickHelpCardExpanded(cardId) === next) {
    return;
  }
  expandedByCard.set(key, next);
  notify();
}

export function toggleQuickHelpCardExpanded(cardId: string | null): void {
  setQuickHelpCardExpanded(cardId, !getQuickHelpCardExpanded(cardId));
}

/** Collapse one card body, e.g. from a "知道了" header action. */
export function collapseQuickHelpCard(cardId: string | null): void {
  setQuickHelpCardExpanded(cardId, false);
}

/** Subscribe a component to the expansion state of one card. */
export function useQuickHelpCardExpanded(cardId: string | null): boolean {
  const getSnapshot = () => getQuickHelpCardExpanded(cardId);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Card instance id provided by `quick-help-card` to its own header actions. */
export const QuickHelpCardInstanceIdContext = createContext<string | null>(null);

/** Resolve the card instance this header action belongs to. */
export function useQuickHelpCardInstanceId(): string | null {
  return useContext(QuickHelpCardInstanceIdContext);
}
