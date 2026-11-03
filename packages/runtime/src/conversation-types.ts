import type { Context, Message } from "@ag-ui/client";

/** Synchronous Host context for each outgoing run, including interrupt resumes. */
export type ConversationRunContextGetter = (input: {
  readonly messages: readonly Message[];
  readonly runConfig: { readonly custom?: Record<string, unknown> } | undefined;
}) => readonly Context[];

export interface ConversationStarterSuggestion {
  prompt: string;
  title?: string | undefined;
  label?: string | undefined;
}
