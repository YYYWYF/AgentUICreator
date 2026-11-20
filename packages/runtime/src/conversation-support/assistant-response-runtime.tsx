"use client";

import { useAui, useAuiState } from "@assistant-ui/react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createSnapshotStore } from "../observation/snapshot-store.js";
import { useStoreValue } from "../observation/use-store-value.js";
import { getAssistantResponseText } from "./assistant-response.js";
import type { ConversationTurnGroup } from "./conversation-turn.js";

export interface AssistantResponseSnapshot {
  group: ConversationTurnGroup;
  text: string;
  isRunning: boolean;
  canReload: boolean;
  canSwitchBranch: boolean;
  branchNumber: number;
  branchCount: number;
}

export interface AssistantResponseRuntime {
  getSnapshot(): AssistantResponseSnapshot;
  subscribe(listener: () => void): () => void;
  reload(): void;
  switchToPreviousBranch(): void;
  switchToNextBranch(): void;
}

const EMPTY_HEAD_STATE = { branchNumber: 1, branchCount: 1 };

const AssistantResponseContext = createContext<AssistantResponseRuntime | null>(
  null,
);

export function useAssistantResponseRuntime(): AssistantResponseRuntime;
export function useAssistantResponseRuntime<T>(selector: (snapshot: AssistantResponseSnapshot) => T): T;
export function useAssistantResponseRuntime<T>(selector: ((snapshot: AssistantResponseSnapshot) => T) | undefined): AssistantResponseRuntime | T;
export function useAssistantResponseRuntime<T>(selector?: (snapshot: AssistantResponseSnapshot) => T): AssistantResponseRuntime | T {
  const response = useContext(AssistantResponseContext);
  const read = () => {
    if (response === null) throw new Error("ASSISTANT_RESPONSE_CONTEXT_REQUIRED");
    return selector === undefined ? response : selector(response.getSnapshot());
  };
  return useStoreValue(response?.subscribe ?? (() => () => {}), read, selector !== undefined);
}

export function AssistantResponseRuntimeProvider({
  group,
  children,
}: {
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
    if (
      !threadClient
        .getState()
        .messages.some(({ id }) => id === group.headAssistantMessageId)
    )
      return EMPTY_HEAD_STATE;
    return threadClient
      .message({ id: group.headAssistantMessageId })
      .getState();
  }, [aui, group.headAssistantMessageId]);
  const subscribe = useCallback(
    (listener: () => void) => aui.subscribe(listener),
    [aui],
  );
  const head = useSyncExternalStore(subscribe, getHeadState, getHeadState);
  const canReload =
    !thread.isRunning &&
    !thread.isDisabled &&
    thread.voice === undefined &&
    thread.capabilities.reload;
  const canSwitchBranch =
    !thread.isRunning &&
    !thread.isDisabled &&
    thread.capabilities.switchToBranch;
  const snapshot = useMemo<AssistantResponseSnapshot>(() => ({
    group,
    text: getAssistantResponseText(thread.messages, group),
    isRunning: thread.isRunning,
    canReload,
    canSwitchBranch,
    branchNumber: head.branchNumber,
    branchCount: head.branchCount,
  }), [group, thread.messages, thread.isRunning, canReload, canSwitchBranch, head.branchNumber, head.branchCount]);
  const value = useMemo(() => {
    const store = createSnapshotStore(snapshot);
    return {
      ...store,
      reload() {
        if (store.getSnapshot().canReload) aui.thread.message({ id: group.headAssistantMessageId }).reload();
      },
      switchToPreviousBranch() {
        const current = store.getSnapshot();
        if (current.canSwitchBranch && current.branchNumber > 1) {
          aui.thread.message({ id: group.headAssistantMessageId }).switchToBranch({ position: "previous" });
        }
      },
      switchToNextBranch() {
        const current = store.getSnapshot();
        if (current.canSwitchBranch && current.branchNumber < current.branchCount) {
          aui.thread.message({ id: group.headAssistantMessageId }).switchToBranch({ position: "next" });
        }
      },
    };
  }, [aui, group.headAssistantMessageId]);
  useLayoutEffect(() => { value.publish(snapshot); }, [value, snapshot]);
  return (
    <AssistantResponseContext.Provider value={value}>
      {children}
    </AssistantResponseContext.Provider>
  );
}
