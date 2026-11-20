import { useContext, useLayoutEffect, useMemo } from 'react';
import { useAui, useAuiState } from '@assistant-ui/react';
import type { RunAgentInput } from '@ag-ui/client';
import type { AgentUIContextValue } from '@za38.03/agent-ui-core';
import { ConversationInputContext, ConversationComposerGuardContext, PluginInstanceContext, type ConversationComposerRunConfig, usePluginService } from '@za38.03/agent-ui-runtime/plugin-api';
import { useConversationComposerSendGuard } from '../internal/conversation-composer-guard.js';
import { emptyData } from './message-data.js';

export type ComposerData = AgentUIContextValue;
/** Captured automatically from the submitting Plugin's context. */
export interface ComposerDataSource {
  readonly pluginId?: string;
  readonly instanceId?: string;
  readonly name?: string;
}
export interface ComposerDataOptions {
  /** Bind data to an input reference. Removing that reference removes its data. */
  reference?: { readonly token: string; readonly text: string; readonly fallbackText: string };
  /** Bind to the native quote, so dismissing/editing the quote excludes its data. */
  quote?: { readonly text: string; readonly messageId: string };
}
export interface ComposerDataEntry extends ComposerDataOptions {
  readonly owner: string;
  readonly source?: ComposerDataSource;
  readonly data: ComposerData;
  /** Internal activation snapshot, frozen with the submitted message. */
  readonly enabled?: boolean;
}
export interface ComposerRequestAdapterInput {
  readonly request: RunAgentInput;
  /** Submitted values keyed by Plugin instance or named sub-scope.
   * Missing data has no key; explicitly submitted null or empty arrays remain values. */
  readonly pluginData: Readonly<Record<string, ComposerData>>;
  readonly sources: Readonly<Record<string, ComposerDataSource>>;
}
/** Synchronous. Its returned request is final; forwardedProps is never merged afterwards. */
export type ComposerRequestAdapter = (input: ComposerRequestAdapterInput) => RunAgentInput;

/** A capability may preserve public message metadata without teaching Composer its domain. */
export interface ComposerMessageDataAdapter {
  readonly metadataKeys: readonly string[];
  fromMetadata(metadata: Readonly<Record<string, unknown>>): Readonly<Record<string, ComposerData>>;
  toMetadata(data: Readonly<Record<string, ComposerData>>, sources: Readonly<Record<string, ComposerDataSource>>): Readonly<Record<string, ComposerData>>;
}

export interface ComposerDataPort {
  getData(threadId: string): Readonly<Record<string, ComposerData>>;
  subscribe(threadId: string, listener: () => void): () => void;
  register(owner: string): () => void;
  setData(threadId: string, owner: string, data: ComposerData, options?: ComposerDataOptions, source?: ComposerDataSource): () => void;
  clearData(threadId: string, owner: string): void;
  setRunConfig(threadId: string, config: ConversationComposerRunConfig): void;
  registerAdapter(owner: string, adapter: ComposerRequestAdapter): () => void;
}
export const ConversationComposerDataContext = ConversationInputContext;

function isComposerDataPort(value: unknown): value is ComposerDataPort {
  return typeof value === 'object' && value !== null &&
    'register' in value && typeof value.register === 'function' &&
    'setData' in value && typeof value.setData === 'function' &&
    'clearData' in value && typeof value.clearData === 'function' &&
    'setRunConfig' in value && typeof value.setRunConfig === 'function' &&
    'getData' in value && typeof value.getData === 'function' &&
    'subscribe' in value && typeof value.subscribe === 'function' &&
    'registerAdapter' in value && typeof value.registerAdapter === 'function';
}

/** Thread-scoped controller for the canonical Composer; selectors opt into data updates.
 * A name isolates components composed inside the same Plugin, or outside a Plugin provider.
 */
function useComposerController(name?: string) {
  const scope = useContext(ConversationComposerDataContext);
  const instance = useContext(PluginInstanceContext);
  const aui = useAui();
  const guardSend = useConversationComposerSendGuard();
  const guardState = useContext(ConversationComposerGuardContext);
  const owner = `${instance?.instance.id ?? 'standalone'}${name ? `:${name}` : ''}`;
  const source = useMemo<ComposerDataSource>(() => ({
    ...(instance ? { pluginId: instance.instance.pluginId, instanceId: instance.instance.id } : {}),
    ...(name ? { name } : {}),
  }), [instance?.instance.pluginId, instance?.instance.id, name]);
  const runtime = isComposerDataPort(scope?.runtime) ? scope.runtime : undefined;
  const threadId = scope?.threadId;
  const nativeThreadId = useAuiState(state => state.threads.mainThreadId);
  const assistant = useMemo(() => aui.threads().__internal_getAssistantRuntime?.(), [aui]);
  const nativeThread = useMemo(() => scope ? assistant?.threads.getById(nativeThreadId) : assistant?.thread,
    [assistant, nativeThreadId, scope?.runtime]);
  const nativeComposer = nativeThread?.composer;
  const fallback = useMemo(() => aui.thread.composer(), [aui, nativeThreadId]);
  const native = nativeComposer ?? fallback;
  useLayoutEffect(() => runtime?.register(owner), [runtime, owner]);
  const composer = useMemo(() => {
    let previous: ReturnType<typeof native.getState> | undefined;
    let snapshot: (ReturnType<typeof native.getState> & {
      readonly data: Readonly<Record<string, ComposerData>>;
      readonly attachmentsEnabled: boolean;
      readonly isRunning: boolean;
      readonly disabled: boolean;
      readonly awaitingReply: boolean;
      readonly interruptKey: string;
    }) | undefined;
    const getState = () => {
      const current = native.getState();
      const thread = nativeThread?.getState() ?? aui.thread.getState();
      const guard = guardState.getSnapshot();
      const awaitingReply = guard.awaitingReply;
      const interruptKey = awaitingReply ? guard.interruptKey : "";
      const data = runtime && threadId ? runtime.getData(threadId) : emptyData;
      const attachmentsEnabled = thread.capabilities.attachments;
      const isRunning = thread.isRunning;
      const disabled = thread.isDisabled || current.dictation?.inputDisabled === true;
      const canSend = current.canSend && !isRunning;
      if (!snapshot || previous !== current || snapshot.data !== data ||
          snapshot.attachmentsEnabled !== attachmentsEnabled || snapshot.isRunning !== isRunning ||
          snapshot.disabled !== disabled || snapshot.canSend !== canSend ||
          snapshot.awaitingReply !== awaitingReply || snapshot.interruptKey !== interruptKey) {
        previous = current;
        snapshot = { ...current, data, attachmentsEnabled, isRunning, disabled, canSend,
          awaitingReply, interruptKey };
      }
      return snapshot;
    };
    return {
      getState,
      getSnapshot: getState,
      get text() { return getState().text; },
      get attachments() { return getState().attachments; },
      get quote() { return getState().quote; },
      get data() { return getState().data; },
      get attachmentAccept() { return getState().attachmentAccept; },
      get attachmentsEnabled() { return getState().attachmentsEnabled; },
      get isRunning() { return getState().isRunning; },
      get disabled() { return getState().disabled; },
      get canSend() { return getState().canSend; },
      get canCancel() { return getState().canCancel; },
      get awaitingReply() { return getState().awaitingReply; },
      subscribe: (listener: () => void) => {
        const stopGuard = guardState.subscribe(listener);
        const stopFallback = nativeComposer ? undefined : aui.subscribe(listener);
        const stopNative = nativeComposer?.subscribe(listener);
        const stopThread = nativeThread?.subscribe(listener);
        const stopData = runtime && threadId ? runtime.subscribe(threadId, listener) : undefined;
        return () => { stopGuard(); stopFallback?.(); stopNative?.(); stopThread?.(); stopData?.(); };
      },
      setQuote: (quote: Parameters<typeof native.setQuote>[0]) => native.setQuote(quote),
      setText: (text: string) => native.setText(text),
      setRunConfig: (config: Parameters<typeof native.setRunConfig>[0]) => {
        if (assistant) {
          const threads = assistant.threads.getState();
          if (threads.mainThreadId !== nativeThreadId && threads.newThreadId !== nativeThreadId &&
              !threads.threadIds.includes(nativeThreadId) && !threads.archivedThreadIds.includes(nativeThreadId)) return;
        }
        if (runtime && threadId) runtime.setRunConfig(threadId, config);
        else native.setRunConfig(config);
      },
      send: () => { if (!guardSend() && !getState().isRunning) native.send(); },
      cancel: () => native.cancel(),
      addAttachment: (file: File) => native.addAttachment(file),
      removeAttachment: (id: string): Promise<void> => {
        if (!nativeComposer) return fallback.attachment({ id }).remove();
        const index = nativeComposer.getState().attachments.findIndex(attachment => attachment.id === id);
        if (index < 0) return Promise.reject(new Error('AGENT_UI_COMPOSER_ATTACHMENT_NOT_FOUND'));
        return nativeComposer.getAttachmentByIndex(index).remove();
      },
      setData: (data: ComposerData, options?: ComposerDataOptions) => {
        if (!runtime || !threadId) throw new Error('AGENT_UI_COMPOSER_RUNTIME_REQUIRED');
        return runtime.setData(threadId, owner, data, options, source);
      },
      clearData: () => { if (runtime && threadId) runtime.clearData(threadId, owner); },
    };
  }, [native, nativeComposer, nativeThread, nativeThreadId, assistant, fallback, runtime, threadId, owner, source, guardState, guardSend, aui]);
  return composer;
}

export type ComposerController = ReturnType<typeof useComposerController>;
export function useComposer(name?: string): ComposerController;
export function useComposer<T>(selector: (state: ComposerState) => T, name?: string): T;
export function useComposer<T>(selector: ((state: ComposerState) => T) | undefined, name?: string): ComposerController | T;
export function useComposer<T>(input?: string | ((state: ComposerState) => T), name?: string): ComposerController | T {
  const composer = useComposerController(typeof input === 'string' ? input : name);
  return usePluginService(composer, typeof input === 'function' ? input : undefined);
}
export type ComposerState = ReturnType<ComposerController['getState']>;
export type ComposerAttachment = ComposerState['attachments'][number];
