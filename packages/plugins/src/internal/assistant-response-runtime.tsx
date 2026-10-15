"use client";

import { useAui, useAuiState } from "@assistant-ui/react";
import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import { getAssistantResponseText } from "./assistant-response.js";
import type { ConversationTurnGroup } from "./conversation-turn.js";

export interface AssistantResponseRuntime {
  group: ConversationTurnGroup;
  text: string;
  isRunning: boolean;
  canReload: boolean;
  canSwitchBranch: boolean;
  branchNumber: number;
  branchCount: number;
  reload(): void;
  switchToPreviousBranch(): void;
  switchToNextBranch(): void;
}

const EMPTY_HEAD_STATE = { branchNumber: 1, branchCount: 1 };

const AssistantResponseContext = createContext<AssistantResponseRuntime | null>(null);

export function useAssistantResponseRuntime(): AssistantResponseRuntime {
  const response = useContext(AssistantResponseContext);
  if (response === null) throw new Error("Assistant response actions require a Response Footer context");
  return response;
}

export function AssistantResponseRuntimeProvider({ group, children }: {
  group: ConversationTurnGroup;
  children?: ReactNode;
}) {
  const aui = useAui();
  const thread = useAuiState((s) => s.thread);
  // Public client equivalent of thread.getMessageById(id). Its reload and
  // switchToBranch delegate to upstream runtime lifecycle with the head target.
  const getHeadState = useCallback(() => {
    const threadClient = aui.thread;
    // A branch switch can notify subscribers before React removes the old footer.
    if (!threadClient.getState().messages.some(({ id }) => id === group.headAssistantMessageId))
      return EMPTY_HEAD_STATE;
    return threadClient.message({ id: group.headAssistantMessageId }).getState();
  },
  [aui, group.headAssistantMessageId]);
  const subscribe = useCallback((listener: () => void) => aui.subscribe(listener), [aui]);
  const head = useSyncExternalStore(subscribe, getHeadState, getHeadState);
  const canReload = !thread.isRunning && !thread.isDisabled &&
    thread.voice === undefined && thread.capabilities.reload;
  const canSwitchBranch = !thread.isRunning && !thread.isDisabled &&
    thread.capabilities.switchToBranch;
  const value: AssistantResponseRuntime = {
    group,
    text: getAssistantResponseText(thread.messages, group),
    isRunning: thread.isRunning,
    canReload,
    canSwitchBranch,
    branchNumber: head.branchNumber,
    branchCount: head.branchCount,
    reload() {
      if (canReload) aui.thread.message({ id: group.headAssistantMessageId }).reload();
    },
    switchToPreviousBranch() {
      if (canSwitchBranch && head.branchNumber > 1)
        aui.thread.message({ id: group.headAssistantMessageId }).switchToBranch({ position: "previous" });
    },
    switchToNextBranch() {
      if (canSwitchBranch && head.branchNumber < head.branchCount)
        aui.thread.message({ id: group.headAssistantMessageId }).switchToBranch({ position: "next" });
    },
  };
  return <AssistantResponseContext.Provider value={value}>{children}</AssistantResponseContext.Provider>;
}
