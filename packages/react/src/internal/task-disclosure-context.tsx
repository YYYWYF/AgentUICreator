"use client";

import { useAuiState } from "@assistant-ui/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type TaskDisclosure = {
  open: ReadonlyMap<string, boolean>;
  setOpen(key: string, open: boolean): void;
};
const TaskDisclosureContext = createContext<TaskDisclosure | null>(null);
export const TaskDisclosureScopeContext = createContext<readonly string[]>([]);

/** Presentation state survives message ID settlement, but never a thread switch. */
export function TaskDisclosureProvider({ children }: { children: ReactNode }) {
  const [open, setEntries] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const empty = useAuiState(s => s.thread.messages.length === 0);
  useEffect(() => {
    if (empty) setEntries(entries => entries.size === 0 ? entries : new Map());
  }, [empty]);
  const setOpen = useCallback((key: string, value: boolean) => {
    setEntries(entries => {
      if ((entries.get(key) ?? false) === value) return entries;
      const next = new Map(entries);
      if (value) next.set(key, true);
      else next.delete(key);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ open, setOpen }), [open, setOpen]);
  return <TaskDisclosureContext.Provider value={value}>{children}</TaskDisclosureContext.Provider>;
}

export function useTaskDisclosure(toolCallId: string) {
  const store = useContext(TaskDisclosureContext);
  const scope = useContext(TaskDisclosureScopeContext);
  const path = [...scope, toolCallId];
  const key = JSON.stringify(path);
  return {
    scope: path,
    open: store === null ? undefined : store.open.get(key) ?? false,
    onOpenChange: store === null ? undefined : (open: boolean) => store.setOpen(key, open),
  };
}
