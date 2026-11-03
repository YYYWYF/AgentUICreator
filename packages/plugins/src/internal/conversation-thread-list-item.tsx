"use client";

import { useAgentUILocale, DEFAULT_AGENT_UI_MESSAGES } from "../locale.js";
import { ThreadListItemMorePrimitive, ThreadListItemPrimitive, useAui, useAuiState } from "@assistant-ui/react";
import { ArchiveIcon, ArchiveRestoreIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, TrashIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./adapters-generated/assistant-ui/components/ui/button.js";
import { Input } from "./adapters-generated/assistant-ui/components/ui/input.js";
import { useAgentUIPortalContainer } from "./style-boundary/AgentUIRoot.js";
import { deleteThreadWithSelectionRecovery } from "./thread-delete-recovery.js";

export interface ConversationThreadListItemActions {
  rename?: boolean;
  archive?: boolean;
  unarchive?: boolean;
  delete?: boolean;
}

export interface ConversationThreadListItemLabels {
  newChat: string;
  moreOptions: string;
  running: string;
  rename: string;
  archive: string;
  unarchive?: string;
  delete: string;
}

export interface ConversationThreadListItemProps {
  /** Omitted: preserve upstream presentation. Supplied: opt in to each action. */
  onNavigate?: (() => void) | undefined;
  actions?: ConversationThreadListItemActions;
  /** Product integrations supply these through their locale layer. */
  labels?: ConversationThreadListItemLabels;
}

const defaultLabels: ConversationThreadListItemLabels = {
  newChat: DEFAULT_AGENT_UI_MESSAGES.threadList.newChat, moreOptions: DEFAULT_AGENT_UI_MESSAGES.threadList.moreOptions, running: DEFAULT_AGENT_UI_MESSAGES.threadList.running,
  rename: DEFAULT_AGENT_UI_MESSAGES.threadList.rename, archive: DEFAULT_AGENT_UI_MESSAGES.threadList.archive, delete: DEFAULT_AGENT_UI_MESSAGES.threadList.delete,
};

export function ConversationThreadListItemComposition(props: ConversationThreadListItemProps) {
  const messages = useAgentUILocale("threadList");
  return <ConfiguredThreadListItem actions={props.actions ?? { rename: true, archive: true, unarchive: true, delete: true }} labels={props.labels ?? messages} onNavigate={props.onNavigate} />;
}

/** Presentation only: all actions and navigation remain assistant-ui-owned. */
function ConfiguredThreadListItem({ actions, labels, onNavigate }: {
  onNavigate?: (() => void) | undefined;
  actions: ConversationThreadListItemActions;
  labels: ConversationThreadListItemLabels;
}) {
  const portalContainer = useAgentUIPortalContainer();
  const aui = useAui();
  const isRunning = useAuiState(s => s.threadListItem.isRunning);
  const archived = useAuiState(s => s.threadListItem.status === "archived");
  const messages = useAgentUILocale("threadList");
  const [isRenaming, setIsRenaming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const renameMenuClose = useRef(false);
  useEffect(() => {
    if (isRenaming || !restoreFocus.current) return;
    restoreFocus.current = false;
    triggerRef.current?.focus();
  }, [isRenaming]);
  const itemClass = "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none";
  return (
    <ThreadListItemPrimitive.Root
      data-agent-ui-owned=""
      data-slot="aui_thread-list-item"
      className="group hover:bg-muted focus-visible:bg-muted data-active:bg-muted has-focus-visible:bg-muted has-data-[state=open]:bg-muted relative flex h-8 items-center rounded-md transition-colors focus-visible:outline-none"
    >
      {isRenaming ? (
        <ThreadRename label={labels.rename} onDone={focus => { restoreFocus.current = focus; setIsRenaming(false); }} />
      ) : (
        <ThreadListItemPrimitive.Trigger
          ref={triggerRef}
          onClick={onNavigate}
          data-agent-ui-owned=""
          data-slot="aui_thread-list-item-trigger"
          className="focus-visible:ring-ring/50 flex h-full min-w-0 flex-1 items-center rounded-md px-2.5 text-start text-sm outline-none group-hover:pe-9 group-has-focus-visible:pe-9 group-has-data-[state=open]:pe-9 group-data-active:pe-9 focus-visible:ring-1"
        >
          {isRunning && <Loader2Icon aria-hidden className="text-muted-foreground me-1.5 size-3.5 shrink-0 animate-spin" />}
          <span data-agent-ui-owned="" data-slot="aui_thread-list-item-title" className="min-w-0 flex-1 truncate">
            <ThreadListItemPrimitive.Title fallback={labels.newChat} />
          </span>
          {isRunning && <span data-agent-ui-owned="" className="sr-only">{labels.running}</span>}
        </ThreadListItemPrimitive.Trigger>
      )}
      {(actions.rename || (archived ? actions.unarchive : actions.archive) || actions.delete) && (
        <ThreadListItemMorePrimitive.Root sharedFocusGroup>
          <ThreadListItemMorePrimitive.Trigger asChild>
            <Button variant="ghost" size="icon" data-slot="agent-ui-thread-action-more"
              className="data-[state=open]:bg-accent absolute end-1.5 top-1/2 size-6 -translate-y-1/2 p-0 opacity-0 group-hover:opacity-100 group-has-focus-visible:opacity-100 group-data-active:opacity-100 data-[state=open]:opacity-100">
              <MoreHorizontalIcon aria-hidden className="size-3.5" />
              <span data-agent-ui-owned="" className="sr-only">{labels.moreOptions}</span>
            </Button>
          </ThreadListItemMorePrimitive.Trigger>
          {/* Retire the closing menu before focusing the inline editor. Its exit
              animation must not retain a focus scope over the next interaction. */}
          {portalContainer !== null && !isRenaming && <ThreadListItemMorePrimitive.Content side="right" align="start" sideOffset={6}
            portalProps={portalContainer === undefined ? undefined : { container: portalContainer }}
            onCloseAutoFocus={event => {
              if (!renameMenuClose.current) return;
              renameMenuClose.current = false;
              event.preventDefault();
            }}
            data-slot="agent-ui-thread-action-menu"
            className="bg-popover text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-32 overflow-hidden rounded-xl border p-1.5">
            {actions.rename && (
              <ThreadListItemMorePrimitive.Item data-slot="agent-ui-thread-action-rename" className={itemClass} onSelect={() => { renameMenuClose.current = true; setIsRenaming(true); }}>
                <PencilIcon aria-hidden className="size-4" />{labels.rename}
              </ThreadListItemMorePrimitive.Item>
            )}
            {!archived && actions.archive && (
              <ThreadListItemPrimitive.Archive asChild>
                <ThreadListItemMorePrimitive.Item data-slot="agent-ui-thread-action-archive" className={itemClass}>
                  <ArchiveIcon aria-hidden className="size-4" />{labels.archive}
                </ThreadListItemMorePrimitive.Item>
              </ThreadListItemPrimitive.Archive>
            )}
            {archived && actions.unarchive && (
              <ThreadListItemPrimitive.Unarchive asChild>
                <ThreadListItemMorePrimitive.Item data-slot="agent-ui-thread-action-unarchive" className={itemClass}>
                  <ArchiveRestoreIcon aria-hidden className="size-4" />{labels.unarchive ?? messages.unarchive}
                </ThreadListItemMorePrimitive.Item>
              </ThreadListItemPrimitive.Unarchive>
            )}
            {actions.delete && (
                <ThreadListItemMorePrimitive.Item data-slot="agent-ui-thread-action-delete" onSelect={() => {
                  void deleteThreadWithSelectionRecovery(aui.threadListItem.getState().id, {
                    getActiveId: () => aui.threads.getState().mainThreadId,
                    subscribe: listener => aui.subscribe(listener),
                    delete: () => aui.threadListItem.delete(),
                    select: id => aui.threads.switchToThread(id),
                    isActiveEmpty: () => !aui.thread.getState().isRunning && aui.thread.getState().messages.length === 0 && aui.composer.getState().isEmpty,
                  }).catch(() => { /* The canonical action already reports errors. */ });
                }}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none">
                  <TrashIcon aria-hidden className="size-4" />{labels.delete}
                </ThreadListItemMorePrimitive.Item>
            )}
          </ThreadListItemMorePrimitive.Content>}
        </ThreadListItemMorePrimitive.Root>
      )}
    </ThreadListItemPrimitive.Root>
  );
}

function ThreadRename({ label, onDone }: { label: string; onDone: (restoreFocus: boolean) => void }) {
  const aui = useAui();
  const title = useAuiState(s => s.threadListItem.title) ?? "";
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  useEffect(() => { inputRef.current?.select(); }, []);
  const commit = (focus: boolean) => {
    if (settled.current) return;
    settled.current = true;
    const next = value.trim();
    if (!next || next === title) { onDone(focus); return; }
    Promise.resolve().then(() => aui.threadListItem.rename(next)).then(
      () => onDone(focus),
      () => { settled.current = false; if (focus) inputRef.current?.focus(); },
    );
  };
  return <Input ref={inputRef} autoFocus data-slot="agent-ui-thread-rename-input" aria-label={label}
    value={value} className="h-7 min-w-0 flex-1 ps-2.5 pe-9 text-sm"
    onChange={event => setValue(event.target.value)} onBlur={() => commit(false)}
    onKeyDown={event => {
      if (event.key === "Enter") { event.preventDefault(); commit(true); }
      if (event.key === "Escape" && !settled.current) { event.preventDefault(); event.stopPropagation(); settled.current = true; onDone(true); }
    }} />;
}
