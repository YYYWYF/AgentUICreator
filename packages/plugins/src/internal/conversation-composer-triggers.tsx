import { useMentionRequest, useCommandRequest, commandRequestItem } from './adapters-generated/assistant-ui/composer-request.js';
import { agentUIDirectiveFormatter } from "./directive-formatter.js";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAui, useAuiState, unstable_useLiveCompletionAdapter, unstable_useTriggerPopoverScopeContext, type Unstable_TriggerItem } from "@assistant-ui/react";
import { ComposerTriggerPopover } from "./adapters-generated/assistant-ui/components/assistant-ui/elements/composer-trigger-popover.aui.js";
import { detectTrigger, type TriggerMatch } from "./trigger-matcher.js";
import { serializeConversationDirective } from "./composer-trigger-utils.js";
import type { ConversationMentionItem, ConversationMentionTriggerProps, ConversationCommandTriggerProps } from "./composer-trigger-types.js";

function SelectionOverride({ cursor }: {
  cursor: { current: ((position: number) => void) | undefined };
}) {
  const scope = unstable_useTriggerPopoverScopeContext();
  useLayoutEffect(() => {
    cursor.current = scope.setCursorPosition;
    return () => { cursor.current = undefined; };
  }, [scope, cursor]);
  return null;
}
function queryRemoved(capture: { match: TriggerMatch; text: string }): string {
  const after = capture.text.slice(capture.match.endOffset);
  return capture.text.slice(0, capture.match.offset) + (after.startsWith(' ') ? after.slice(1) : after);
}
const emptyCommands = Object.freeze([]);
const noopSubscribe = () => () => {};
function useTriggerEnabled() {
  return useAuiState(s => !s.thread.isDisabled && !s.thread.isLoading && s.thread.composer.isEditing && s.thread.composer.type === "thread" && !s.thread.composer.dictation);
}
export function InternalConversationMentionTrigger({ source, labels, debounceMs, onSelect, requestAdapter }: ConversationMentionTriggerProps) {
  const aui = useAui();
  const captureRequest = useMentionRequest(requestAdapter);
  const cursor = useRef<((position: number) => void) | undefined>(undefined);
  const rangeRef = useRef<{ match: TriggerMatch; text: string } | null>(null);
  const itemsRef = useRef<readonly ConversationMentionItem[]>([]);
  const matcher = useCallback((text: string, char: string, cursor: number) => {
    const match = detectTrigger(text, char, cursor);
    // Lexical also invokes the matcher on individual text nodes. Only the
    // canonical full-text detection can supply offsets for composer.setText.
    if (match !== null && text === aui.thread.composer().getState().text) {
      rangeRef.current = { match, text };
    }
    return match;
  }, [aui]);
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
        if (!item.id || !item.label || (!onSelect && !requestAdapter && !serializeConversationDirective(item)) || ids.has(item.id)) return false;
        ids.add(item.id); return true;
      });
      resolvedQuery.current = query;
      itemsRef.current = safe;
      if (safe.length !== result.length) setError("invalid");
      return safe;
    } catch (error) {
      if (!controller.signal.aborted) setError("search");
      throw error;
    }
  }, [source, onSelect, requestAdapter]);
  useLayoutEffect(() => {
    setError(null); resolvedQuery.current = null; itemsRef.current = []; rangeRef.current = null;
    return () => { request.current?.abort(); request.current = null; };
  }, [cacheKey, enabled]);
  const completion = unstable_useLiveCompletionAdapter({ fetcher, enabled: enabled && source !== undefined,
    cacheKey, debounceMs });
  const adapter = useMemo(() => ({ ...completion.adapter, search(query: string) {
    const items = completion.adapter.search?.(query) ?? [];
    return resolvedQuery.current === query ? items : [];
  } }), [completion.adapter]);
  const select = useCallback((item: Unstable_TriggerItem) => {
    const original = itemsRef.current.find(candidate => candidate.id === item.id);
    const capture = rangeRef.current;
    const composer = aui.thread.composer();
    if (!enabled || !original || !capture || composer.getState().text !== queryRemoved(capture)) return true;
    try {
      let value = onSelect ? onSelect(original, { text: capture.text, range: { start: capture.match.offset, end: capture.match.endOffset } })
        : requestAdapter ? original.label : serializeConversationDirective(original);
      if (value) value = captureRequest(original, onSelect ? value ?? original.label : original.label, value ?? original.label, serializeConversationDirective(original) ?? original.label, onSelect !== undefined);
      if (value !== null && typeof value !== 'string') throw new Error('Invalid trigger selection result.');
      const before = capture.text.slice(0, capture.match.offset);
      const after = capture.text.slice(capture.match.endOffset);
      const replacement = value === null ? '' : value;
      composer.setText(before + replacement + (replacement && !after.startsWith(' ') ? ` ${after}` : after));
      cursor.current?.(before.length + replacement.length + (replacement && !after.startsWith(' ') ? 1 : 0));
    } catch {
      composer.setText(capture.text); cursor.current?.(capture.match.endOffset); setError('invalid');
    }
    return true;
  }, [aui, enabled, onSelect, requestAdapter, captureRequest]);
  if (!enabled || source === undefined) return null;
  return <>
    <ComposerTriggerPopover char="@" adapter={adapter} isLoading={completion.isLoading} matcher={matcher}
      aria-label={labels.suggestions} backLabel={labels.back} emptyCategoriesLabel={labels.empty}
      emptyItemsLabel={labels.empty} loadingLabel={labels.loading}
      action={{ onExecute: select, removeOnExecute: true }}>
      <SelectionOverride cursor={cursor} />
    </ComposerTriggerPopover>
    {error && <div data-agent-ui-owned="" role="status" data-slot="composer-trigger-error">{error === "invalid" ? labels.invalidItem : labels.searchFailed} <button data-agent-ui-owned="" type="button" onClick={() => { setError(null); setRetry(value => value + 1); }}>{labels.retry}</button></div>}
  </>;
}
export function InternalConversationCommandTrigger({ source, labels, onSelect, requestAdapter }: ConversationCommandTriggerProps) {
  const aui = useAui();
  const captureRequest = useCommandRequest(requestAdapter);
  const cursor = useRef<((position: number) => void) | undefined>(undefined);
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
    if (match !== null) rangeRef.current = { match, text };
    return match;
  }, []);
  const adapter = useMemo(() => ({ categories: () => [], categoryItems: () => [], search: (query: string) => {
    const ids = new Set<string>();
    return commands.filter(command => {
      if (!command.id || !command.label || ids.has(command.id) || (!onSelect && !requestAdapter && !serializeConversationDirective({ ...command, type: "command" }))) return false;
      ids.add(command.id);
      return !command.disabled && `${command.id} ${command.label} ${command.description ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
    }).map(command => ({ id: command.id, type: "command", label: command.label, ...(command.description === undefined ? {} : { description: command.description }) }));
  } }), [commands, onSelect, requestAdapter]);
  const select = useCallback((item: Unstable_TriggerItem, setCursor: (position: number) => void) => {
    const command = source?.getSnapshot().find(command => command.id === item.id);
    if (!command || command.disabled || busyRef.current || !enabled) return true;
    if (onSelect === undefined && command.mode === "action") return false;
    const capture = rangeRef.current;
    const composer = aui.thread.composer();
    const expected = capture ? queryRemoved(capture) : undefined;
    if (!capture || composer.getState().text !== expected) { setError(labels.invalidItem); return true; }
    try {
      let value = onSelect === undefined ? requestAdapter ? command.label : serializeConversationDirective({ ...command, type: 'command' })
        : onSelect(command, { text: capture.text, range: { start: capture.match.offset, end: capture.match.endOffset } });
      if (value) value = captureRequest(commandRequestItem(command), onSelect ? value ?? command.label : command.label, value ?? command.label, serializeConversationDirective({ ...command, type: 'command' }) ?? command.label, onSelect !== undefined);
      if (value !== null && typeof value !== 'string') throw new Error('Invalid trigger selection result.');
      const before = capture.text.slice(0, capture.match.offset);
      const after = capture.text.slice(capture.match.endOffset);
      const replacement = value ?? '';
      composer.setText(before + replacement + (replacement && !after.startsWith(' ') ? ` ${after}` : after));
      setCursor(before.length + replacement.length + (replacement && !after.startsWith(' ') ? 1 : 0));
    } catch {
      composer.setText(capture.text); setCursor(capture.match.endOffset);
      setError(labels.commandFailed);
    }
    return true;
  }, [aui, source, enabled, labels.invalidItem, labels.commandFailed, onSelect, requestAdapter, captureRequest]);
  const execute = useCallback((item: Unstable_TriggerItem) => {
    const command = source?.getSnapshot().find(command => command.id === item.id);
    if (!command || command.mode !== "action" || command.disabled) return;
    const owner = generation.current;
    busyRef.current = true; setError(null); setBusy(true);
    Promise.resolve().then(() => command.execute()).catch(() => {
      if (generation.current === owner) setError(labels.commandFailed);
    }).finally(() => { if (generation.current === owner) { busyRef.current = false; setBusy(false); } });
  }, [source, labels.commandFailed]);
  if (!enabled || !source || busy) return error === null ? null : <div data-agent-ui-owned="" role="status">{error}</div>;
  return <>
    <ComposerTriggerPopover char="/" adapter={adapter} matcher={matcher}
      aria-label={labels.suggestions} backLabel={labels.back} emptyCategoriesLabel={labels.empty}
      emptyItemsLabel={labels.empty} loadingLabel={labels.loading} action={{ formatter: agentUIDirectiveFormatter,
        onExecute: item => {
          const command = source?.getSnapshot().find(candidate => candidate.id === item.id);
          if (command?.mode === 'action' && onSelect === undefined) execute(item);
          else select(item, position => cursor.current?.(position));
        }, removeOnExecute: true }}>
      <SelectionOverride cursor={cursor} />
    </ComposerTriggerPopover>
    {error !== null && <div data-agent-ui-owned="" role="status" data-slot="composer-trigger-error">{error}</div>}
  </>;
}
