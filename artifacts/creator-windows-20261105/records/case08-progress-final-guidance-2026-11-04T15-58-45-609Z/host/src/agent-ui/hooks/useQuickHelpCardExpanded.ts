import { useSyncExternalStore } from "react";

/**
 * Shared expansion state for the quick help card.
 *
 * The card itself and the actions placed in its `headerActions` slot are
 * separate Plugin instances, so the state lives in one tiny project-owned
 * store outside React. Theme switching only re-renders the tree, the module
 * (and therefore this state) keeps its value.
 */
let expanded = true;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return expanded;
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function setQuickHelpCardExpanded(next: boolean): void {
  if (expanded === next) {
    return;
  }
  expanded = next;
  notify();
}

export function toggleQuickHelpCardExpanded(): void {
  setQuickHelpCardExpanded(!expanded);
}

/** Collapse the card body, e.g. from a "知道了" header action. */
export function collapseQuickHelpCard(): void {
  setQuickHelpCardExpanded(false);
}

/** Read the current expansion state outside React. */
export function getQuickHelpCardExpanded(): boolean {
  return expanded;
}

/** Subscribe a component to the shared expansion state. */
export function useQuickHelpCardExpanded(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
