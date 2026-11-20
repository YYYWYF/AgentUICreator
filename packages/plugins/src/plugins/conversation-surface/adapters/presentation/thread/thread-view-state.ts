'use client';

import { type AssistantState } from '@assistant-ui/react';

// Startup exposes a loading placeholder thread; treat it as a new chat so
// the composer mounts centered. Loads after startup keep the docked layout.
export const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 && (!s.thread.isLoading || s.threads.isLoading);

// A switched thread that is still fetching its history: skeleton, not welcome.
export const isHistoryLoadingView = (s: AssistantState) =>
  s.thread.messages.length === 0 && s.thread.isLoading && !s.thread.isDisabled && !s.threads.isLoading;
