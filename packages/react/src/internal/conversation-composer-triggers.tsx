import { agentUIDirectiveFormatter } from "./directive-formatter.js";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAui, useAuiState, unstable_useLiveCompletionAdapter, unstable_useTriggerPopoverScopeContext, type Unstable_TriggerItem } from "@assistant-ui/react";
import { ComposerTriggerPopover } from "./vendor/assistant-ui/components/assistant-ui/elements/composer-trigger-popover.aui.js";
import { detectTrigger, type TriggerMatch } from "./trigger-matcher.js";
import { serializeConversationDirective } from "./composer-trigger-utils.js";
import type { ConversationMentionTriggerProps, ConversationCommandTriggerProps } from "./composer-trigger-types.js";

function SelectionOverride({ select }: { select: (item: Unstable_TriggerItem, setCursor: (position: number) => void) => boolean }) {
  const scope = unstable_useTriggerPopoverScopeContext();
  useLayoutEffect(() => scope.registerSelectItemOverride(item => select(item, scope.setCursorPosition)), [scope, select]);
  return null;
}
const emptyCommands = Object.freeze([]);
const noopSubscribe = () => () => {};
function useTriggerEnabled() {
  return useAuiState(s => !s.thread.isDisabled && !s.thread.isLoading && s.thread.composer.isEditing && s.thread.composer.type === "thread" && !s.thread.composer.dictation);
}
export function InternalConversationMentionTrigger({ source, labels, debounceMs }: ConversationMentionTriggerProps) {
  const enabled = useTriggerEnabled();
  const threadId = useAuiState(s => s.threads.mainThreadId);
  const subscribe = useCallback((listener: () => void) => source?.subscribe?.(listener) ?? noopSubscribe(), [source]);
  const snapshot = useCallback(() => source?.cacheKey, [source]);
  const sourceCacheKey = useSyncExternalStore(subscribe, snapshot, snapshot);
  const request = useRef<AbortController | null>(null);
  const [error, setError] = useState<"search" | "invalid" | null>(null);
  const [retry, setRetry] = useState(0);
  const resolvedQuery = useRef<string | null>(null);
  const cacheVersion = useRef(0);
  const cacheKey = useMemo(() => ++cacheVersion.current, [source, sourceCacheKey, threadId, retry]);
  const fetcher = useCallback(async (query: string) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setError(null);
    try {
      const result = await source!.search({ query, signal: controller.signal });
      if (controller.signal.aborted) return [];
      const ids = new Set<string>();
      const safe = result.filter(item => {
        if (!serializeConversationDirective(item) || ids.has(item.id)) return false;
        ids.add(item.id); return true;
      });
      resolvedQuery.current = query;
      if (safe.length !== result.length) setError("invalid");
      return safe;
    } catch (error) {
      if (!controller.signal.aborted) setError("search");
      throw error;
    }
  }, [source]);
  useLayoutEffect(() => {
    setError(null); resolvedQuery.current = null;
    return () => { request.current?.abort(); request.current = null; };
  }, [cacheKey, enabled]);
  const completion = unstable_useLiveCompletionAdapter({ fetcher, enabled: enabled && source !== undefined,
    cacheKey, debounceMs });
  const adapter = useMemo(() => ({ ...completion.adapter, search(query: string) {
    const items = completion.adapter.search?.(query) ?? [];
    return resolvedQuery.current === query ? items : [];
  } }), [completion.adapter]);
  if (!enabled || source === undefined) return null;
  return <>
    <ComposerTriggerPopover char="@" adapter={adapter} isLoading={completion.isLoading}
      aria-label={labels.suggestions} backLabel={labels.back} emptyCategoriesLabel={labels.empty}
      emptyItemsLabel={labels.empty} loadingLabel={labels.loading} directive={{ formatter: agentUIDirectiveFormatter }} />
    {error && <div role="status" data-slot="composer-trigger-error">{error === "invalid" ? labels.invalidItem : labels.searchFailed} <button type="button" onClick={() => { setError(null); setRetry(value => value + 1); }}>{labels.retry}</button></div>}
  </>;
}
export function InternalConversationCommandTrigger({ source, labels }: ConversationCommandTriggerProps) {
  const aui = useAui();
  const enabled = useTriggerEnabled();
  const threadId = useAuiState(s => s.threads.mainThreadId);
  const subscribe = useCallback((listener: () => void) => source?.subscribe(listener) ?? noopSubscribe(), [source]);
  const snapshot = useCallback(() => source?.getSnapshot() ?? emptyCommands, [source]);
  const commands = useSyncExternalStore(subscribe, snapshot, snapshot);
  const rangeRef = useRef<{ match: TriggerMatch; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  useLayoutEffect(() => { generation.current++; setError(null); setBusy(false); busyRef.current = false; return () => { generation.current++; rangeRef.current = null; }; }, [source, threadId, enabled]);
  const matcher = useCallback((text: string, char: string, cursor: number) => {
    const match = detectTrigger(text, char, cursor);
    rangeRef.current = match === null ? null : { match, text };
    return match;
  }, []);
  const adapter = useMemo(() => ({ categories: () => [], categoryItems: () => [], search: (query: string) => {
    const ids = new Set<string>();
    return commands.filter(command => {
      if (ids.has(command.id) || !serializeConversationDirective({ ...command, type: "command" })) return false;
      ids.add(command.id);
      return !command.disabled && `${command.id} ${command.label} ${command.description ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
    }).map(command => ({ id: command.id, type: "command", label: command.label, ...(command.description === undefined ? {} : { description: command.description }) }));
  } }), [commands]);
  const select = useCallback((item: Unstable_TriggerItem, setCursor: (position: number) => void) => {
    const command = source?.getSnapshot().find(command => command.id === item.id);
    if (!command || command.disabled || busyRef.current || !enabled) return true;
    if (command.mode === "action") return false;
    const value = serializeConversationDirective({ ...command, type: "command" });
    const capture = rangeRef.current;
    const composer = aui.thread.composer();
    if (!value || !capture || composer.getState().text !== capture.text) { setError(labels.invalidItem); return true; }
    const before = capture.text.slice(0, capture.match.offset);
    const after = capture.text.slice(capture.match.endOffset);
    composer.setText(before + value + (after.startsWith(" ") ? after : ` ${after}`));
    setCursor(before.length + value.length + 1);
    return true;
  }, [aui, source, enabled, labels.invalidItem]);
  const execute = useCallback((item: Unstable_TriggerItem) => {
    const command = source?.getSnapshot().find(command => command.id === item.id);
    if (!command || command.mode !== "action" || command.disabled) return;
    const owner = generation.current;
    busyRef.current = true; setError(null); setBusy(true);
    Promise.resolve().then(() => command.execute()).catch(() => {
      if (generation.current === owner) setError(labels.commandFailed);
    }).finally(() => { if (generation.current === owner) { busyRef.current = false; setBusy(false); } });
  }, [source, labels.commandFailed]);
  if (!enabled || !source || busy) return error === null ? null : <div role="status">{error}</div>;
  return <>
    <ComposerTriggerPopover char="/" adapter={adapter} matcher={matcher}
      aria-label={labels.suggestions} backLabel={labels.back} emptyCategoriesLabel={labels.empty}
      emptyItemsLabel={labels.empty} loadingLabel={labels.loading} action={{ formatter: agentUIDirectiveFormatter, onExecute: execute, removeOnExecute: true }}>
      <SelectionOverride select={select} />
    </ComposerTriggerPopover>
    {error !== null && <div role="status" data-slot="composer-trigger-error">{error}</div>}
  </>;
}
