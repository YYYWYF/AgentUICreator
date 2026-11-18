import { createContext, useContext, useLayoutEffect, useMemo } from 'react';
import { useAui, useAuiState } from '@assistant-ui/react';
import type { RunAgentInput } from '@ag-ui/client';
import type { AgentUIContextValue } from '@za38.03/agent-ui-core';
import type { ConversationComposerRunConfig } from './composer.js';
import { PluginInstanceContext } from './PluginInstanceContext.js';

export type ComposerData = AgentUIContextValue;
export interface ComposerDataOptions {
  /** Bind data to an input reference. Removing that reference removes its data. */
  reference?: { readonly token: string; readonly text: string; readonly fallbackText: string };
  /** Bind to the native quote, so dismissing/editing the quote excludes its data. */
  quote?: { readonly text: string; readonly messageId: string };
  /** Optional default assembly only; the final requestAdapter may replace everything. */
  defaultForwardedProps?: Readonly<Record<string, ComposerData>>;
  defaultTextPrefix?: string;
  /** Original selection, separately available to the final adapter. Must be JSON. */
  selection?: ComposerData;
  /** Defaults to true. Reference-only Plugins can retain their existing wire format. */
  includeInRequest?: boolean;
}
export interface ComposerDataEntry extends ComposerDataOptions {
  readonly owner: string;
  readonly data: ComposerData;
  /** Internal activation snapshot, frozen with the submitted message. */
  readonly enabled?: boolean;
}
export interface ComposerRequestAdapterInput {
  readonly request: RunAgentInput;
  /** Keys are Plugin instance IDs (or an explicitly named sub-scope). */
  readonly pluginData: Readonly<Record<string, ComposerData>>;
  readonly selections: Readonly<Record<string, readonly ComposerData[]>>;
}
/** Synchronous. Its returned request is final; forwardedProps is never merged afterwards. */
export type ComposerRequestAdapter = (input: ComposerRequestAdapterInput) => RunAgentInput;

export interface ComposerDataPort {
  register(owner: string): () => void;
  setData(threadId: string, owner: string, data: ComposerData, options?: ComposerDataOptions): () => void;
  clearData(threadId: string, owner: string): void;
  setRunConfig(threadId: string, config: ConversationComposerRunConfig): void;
  registerAdapter(owner: string, adapter: ComposerRequestAdapter): () => void;
}
export const ConversationComposerDataContext = createContext<{
  readonly runtime: ComposerDataPort;
  readonly threadId: string;
} | null>(null);

/** Extends the canonical composer with JSON draft data; never creates a Runtime.
 * A name isolates components composed inside the same Plugin, or outside a Plugin provider.
 */
export function useComposer(name?: string) {
  const scope = useContext(ConversationComposerDataContext);
  const instance = useContext(PluginInstanceContext);
  const aui = useAui();
  const owner = `${instance?.instance.id ?? 'standalone'}${name ? `:${name}` : ''}`;
  const runtime = scope?.runtime;
  const threadId = scope?.threadId;
  const nativeThreadId = useAuiState(state => state.threads.mainThreadId);
  const nativeComposer = useMemo(() => {
    const assistant = aui.threads().__internal_getAssistantRuntime?.();
    return scope ? assistant?.threads.getById(nativeThreadId).composer : assistant?.thread.composer;
  }, [aui, nativeThreadId, scope?.runtime]);
  const native = nativeComposer ?? aui.thread.composer();
  useLayoutEffect(() => runtime?.register(owner), [runtime, owner]);
  return useMemo(() => ({
    getState: () => native.getState(),
    subscribe: (listener: () => void) => nativeComposer?.subscribe(listener) ?? (() => {}),
    setQuote: (quote: Parameters<typeof native.setQuote>[0]) => native.setQuote(quote),
    setText: (text: string) => native.setText(text),
    setRunConfig: (config: Parameters<typeof native.setRunConfig>[0]) => {
      if (runtime && threadId) runtime.setRunConfig(threadId, config);
      else native.setRunConfig(config);
    },
    send: () => native.send(),
    setData: (data: ComposerData, options?: ComposerDataOptions) => {
      if (!runtime || !threadId) throw new Error('AGENT_UI_COMPOSER_RUNTIME_REQUIRED');
      return runtime.setData(threadId, owner, data, options);
    },
    clearData: () => { if (runtime && threadId) runtime.clearData(threadId, owner); },
  }), [native, nativeComposer, runtime, threadId, owner]);
}

/** Used by Composer implementations, including source-owned ones. */
export function useComposerRequestAdapter(adapter: ComposerRequestAdapter | undefined): void {
  const scope = useContext(ConversationComposerDataContext);
  const instance = useContext(PluginInstanceContext);
  const owner = instance?.instance.id ?? 'composer';
  const runtime = scope?.runtime;
  useLayoutEffect(() => adapter && runtime ? runtime.registerAdapter(owner, adapter) : undefined,
    [runtime, owner, adapter]);
}
