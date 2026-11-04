import { useEffect, useRef } from "react";

/**
 * Draft bridge for project Plugins that render outside the composer subtree.
 *
 * The composer adapter registers the conversation composer's `setText`; other
 * Plugins (for example the quick help card action row) only ever write the
 * draft. Sending stays a user action, so this module intentionally exposes no
 * `send` or `cancel` path.
 */
type ComposerDraftWriter = (text: string) => void;

let writer: ComposerDraftWriter | null = null;
let pendingText: string | null = null;

function flushPendingText(): void {
  if (writer === null || pendingText === null) {
    return;
  }
  const text = pendingText;
  pendingText = null;
  writer(text);
}

export function registerComposerDraftWriter(next: ComposerDraftWriter | null): void {
  writer = next;
  flushPendingText();
}

/** Replace the current composer draft. Never sends it. */
export function fillComposerDraft(text: string): void {
  if (writer === null) {
    // The composer is not mounted yet; apply the text as soon as it registers.
    pendingText = text;
    return;
  }
  writer(text);
}

/**
 * Called by the composer adapter so Plugins outside the composer subtree can
 * fill the draft while the composer is mounted.
 */
export function useComposerDraftWriter(setText: ComposerDraftWriter): void {
  const latest = useRef(setText);

  useEffect(() => {
    latest.current = setText;
  }, [setText]);

  useEffect(() => {
    registerComposerDraftWriter((text) => {
      latest.current(text);
    });
    return () => {
      registerComposerDraftWriter(null);
    };
  }, []);
}
