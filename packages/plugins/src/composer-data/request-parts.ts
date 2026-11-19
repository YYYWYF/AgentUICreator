import type { Message, RunAgentInput } from '@ag-ui/client';
import { RunAgentInputSchema } from '@ag-ui/core/schemas';
import type { AssistantRuntime, ThreadMessage } from '@assistant-ui/react';
import { snapshotAgentUIContext } from '@za38.03/agent-ui-core';
import type { ConversationComposerRunConfig, ConversationInputRequestContext } from '@za38.03/agent-ui-runtime/plugin-api';
import type { ComposerData, ComposerDataEntry, ComposerDataOptions, ComposerDataPort, ComposerRequestAdapter, ComposerMessageDataAdapter, ComposerDataSource } from './request.js';
import { metadataKey, draftMetadataKey, editKey, runConfigKey, emptyData, readComposerMessageData, readComposerMessageSources } from './message-data.js';
import { injectConversationQuoteContext } from './quote-context.js';
import { readNativeInputSession, isSubmittedUserMessage } from './native-session.js';

type DataMap = Record<string, ComposerDataEntry>;
interface ThreadData {
  snapshot: DataMap;
  seen: Set<string>;
  listeners: Set<() => void>;
  native?: AssistantRuntime;
}
export interface ConversationRequestPlan {
  messageMetadata: Readonly<Record<string, ComposerData>>;
  metadataKeys: readonly string[];
  userId: string;
  sourceText: string;
  text: string;
  pluginData: Record<string, ComposerData>;
  selections: Record<string, ComposerData[]>;
  sources: Record<string, ComposerDataSource>;
  forwardedProps: Record<string, ComposerData>;
  adapter: ComposerRequestAdapter | undefined;
  defaultForwardedProps: Record<string, ComposerData>;
  textPrefix: string;
  quotePrefix: string;
}
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function json(value: unknown): ComposerData {
  return snapshotAgentUIContext({ value })!.value as ComposerData;
}
function textOf(message: ThreadMessage): string {
  return message.content.filter(part => part.type === 'text').map(part => part.text).join('');
}
function publicMessage(message: Message): Message {
  const metadata = record(message.metadata);
  if (!metadata || (!(metadataKey in metadata) && !(draftMetadataKey in metadata) && !(editKey in metadata))) return message;
  const { [metadataKey]: _private, [draftMetadataKey]: _draft, [editKey]: _edit, ...rest } = metadata;
  return { ...message, metadata: rest };
}
function entries(message: ThreadMessage, metadataAdapter?: ComposerMessageDataAdapter): DataMap {
  const values = record(message.metadata.custom[metadataKey]) ?? record(message.metadata.custom[draftMetadataKey]) ??
    Object.fromEntries(Object.entries(metadataAdapter?.fromMetadata(message.metadata.custom) ?? {}).map(([key, data]) =>
      [key, { owner: key, source: { pluginId: key }, data, enabled: true, selection: data }]));
  const text = textOf(message);
  const offsets = new Map<string, number>();
  return Object.fromEntries(Object.entries(values).flatMap(([key, candidate]) => {
    const entry = record(candidate);
    if (!entry || typeof entry.owner !== 'string' || !Object.hasOwn(entry, 'data')) throw new Error('AGENT_UI_INVALID_COMPOSER_DATA');
    if ((entry.source !== undefined && (!record(entry.source) ||
      Object.values(record(entry.source)!).some(value => typeof value !== 'string'))) ||
      (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') ||
      (entry.includeInRequest !== undefined && typeof entry.includeInRequest !== 'boolean') ||
      (entry.defaultTextPrefix !== undefined && typeof entry.defaultTextPrefix !== 'string') ||
      (entry.defaultForwardedProps !== undefined && !record(entry.defaultForwardedProps))) throw new Error('AGENT_UI_INVALID_COMPOSER_DATA');
    const reference = entry.reference === undefined ? undefined : record(entry.reference);
    if (entry.reference !== undefined && (!reference || typeof reference.token !== 'string' || !reference.token ||
      typeof reference.text !== 'string' || typeof reference.fallbackText !== 'string')) throw new Error('AGENT_UI_INVALID_COMPOSER_DATA');
    if (reference) {
      const token = reference.token as string;
      const position = text.indexOf(token, offsets.get(token) ?? 0);
      if (position < 0) return [];
      offsets.set(token, position + token.length);
    }
    if (entry.quote !== undefined) {
      const expected = record(entry.quote), actual = record(message.metadata.custom.quote);
      if (!expected || typeof expected.text !== 'string' || typeof expected.messageId !== 'string') throw new Error('AGENT_UI_INVALID_COMPOSER_DATA');
      if (!actual || actual.text !== expected.text || actual.messageId !== expected.messageId) return [];
    }
    // Validate restored history as strictly as a fresh setData call.
    return [[key, json(entry) as unknown as ComposerDataEntry]];
  }));
}

/** Owns draft data only. Native messages and queues own submitted snapshots. */
export class ConversationRequestPartsRuntime implements ComposerDataPort {
  private readonly plans = new Map<string, ConversationRequestPlan>();
  private readonly owners = new Map<string, number>();
  private readonly adapters = new Map<string, ComposerRequestAdapter>();
  private readonly threads = new Map<string, ThreadData>();
  private readonly dataCache = new Map<string, { snapshot: DataMap; ownersVersion: number; data: Readonly<Record<string, ComposerData>> }>();
  private ownersVersion = 0;
  constructor(private readonly messageData?: ComposerMessageDataAdapter) {
    if (messageData?.metadataKeys.some(key => !key.trim() || [metadataKey, draftMetadataKey, editKey].includes(key)))
      throw new Error('AGENT_UI_INVALID_COMPOSER_METADATA_ADAPTER');
  }
  private projectMetadata(snapshot: DataMap): Readonly<Record<string, ComposerData>> {
    const value = json(this.messageData?.toMetadata(readComposerMessageData({ [metadataKey]: snapshot }), readComposerMessageSources({ [metadataKey]: snapshot })) ?? {});
    const metadata = record(value);
    if (!metadata || Object.keys(metadata).some(key => !this.messageData?.metadataKeys.includes(key)))
      throw new Error('AGENT_UI_INVALID_COMPOSER_METADATA_ADAPTER');
    return value as Record<string, ComposerData>;
  }
  onHistoryLoaded(messages: readonly unknown[]): void {
    for (const message of messages) {
      if (!isSubmittedUserMessage(message)) continue;
      // Native enrichment may later merge the active draft. Retain this message's own snapshot.
      message.metadata.custom[metadataKey] = structuredClone(entries(message, this.messageData));
    }
  }
  getData(threadId: string): Readonly<Record<string, ComposerData>> {
    const state = this.threads.get(threadId);
    if (!state) return emptyData;
    const cached = this.dataCache.get(threadId);
    if (cached?.snapshot === state.snapshot && cached.ownersVersion === this.ownersVersion) return cached.data;
    const active = Object.fromEntries(Object.entries(state.snapshot).filter(([, entry]) =>
      (!entry.reference && !entry.quote) || this.owners.has(entry.owner)));
    const data = readComposerMessageData({ [metadataKey]: active });
    this.dataCache.set(threadId, { snapshot: state.snapshot, ownersVersion: this.ownersVersion, data });
    return data;
  }
  subscribe(threadId: string, listener: () => void): () => void {
    const state = this.state(threadId);
    state.listeners.add(listener);
    return () => { state.listeners.delete(listener); };
  }
  private state(threadId: string): ThreadData {
    let state = this.threads.get(threadId);
    if (!state) {
      state = { snapshot: {}, seen: new Set(), listeners: new Set() };
      this.threads.set(threadId, state);
    }
    return state;
  }
  private snapshot(state: ThreadData): DataMap {
    return Object.fromEntries(Object.entries(state.snapshot).map(([key, entry]) =>
      [key, { ...structuredClone(entry), enabled: (!entry.reference && !entry.quote) || this.owners.has(entry.owner) }]));
  }
  private refreshOwner(owner: string): void {
    for (const state of this.threads.values()) if (Object.values(state.snapshot).some(entry => entry.owner === owner)) {
      this.syncDraft(state);
      state.listeners.forEach(listener => listener());
    }
  }
  private syncDraft(state: ThreadData): void {
    const composer = state.native?.thread.composer;
    if (!composer) return;
    const config = composer.getState().runConfig;
    const { [runConfigKey]: _private, ...custom } = config.custom ?? {};
    composer.setRunConfig({ ...config, custom: { ...custom,
      [runConfigKey]: this.snapshot(state),
    } });
  }
  setRunConfig(threadId: string, config: ConversationComposerRunConfig): void {
    const state = this.state(threadId);
    state.native?.thread.composer.setRunConfig({ ...config, custom: { ...config.custom,
      [runConfigKey]: this.snapshot(state),
    } });
  }
  register(owner: string): () => void {
    this.owners.set(owner, (this.owners.get(owner) ?? 0) + 1);
    if (this.owners.get(owner) === 1) { this.ownersVersion++; this.refreshOwner(owner); }
    return () => {
      const count = (this.owners.get(owner) ?? 1) - 1;
      if (count) this.owners.set(owner, count);
      else { this.owners.delete(owner); this.ownersVersion++; this.refreshOwner(owner); }
    };
  }
  registerAdapter(owner: string, adapter: ComposerRequestAdapter): () => void {
    if (this.adapters.size) throw new Error('AGENT_UI_DUPLICATE_COMPOSER_REQUEST_ADAPTER');
    this.adapters.set(owner, adapter);
    return () => { if (this.adapters.get(owner) === adapter) this.adapters.delete(owner); };
  }
  private restoreReferences(state: ThreadData, removed: readonly ComposerDataEntry[]): void {
    const composer = state.native?.thread.composer;
    if (!composer) return;
    const original = composer.getState().text;
    let text = original;
    for (const part of removed) {
      const reference = part.reference;
      if (reference && reference.token !== reference.text) text = text.split(reference.token).join(reference.fallbackText);
    }
    if (text !== original) composer.setText(text);
  }
  setData(threadId: string, owner: string, data: ComposerData, options: ComposerDataOptions = {}, source: ComposerDataSource = {}): () => void {
    const entry = json({ ...options, owner, source, data }) as unknown as ComposerDataEntry;
    if (entry.includeInRequest !== undefined && typeof entry.includeInRequest !== 'boolean') throw new Error('AGENT_UI_INVALID_COMPOSER_DATA');
    if (entry.reference !== undefined && (!record(entry.reference) || !entry.reference.token || typeof entry.reference.token !== 'string' ||
      typeof entry.reference.text !== 'string' || typeof entry.reference.fallbackText !== 'string')) throw new Error('AGENT_UI_INVALID_COMPOSER_DATA');
    if (entry.quote !== undefined && (!record(entry.quote) || typeof entry.quote.text !== 'string' || typeof entry.quote.messageId !== 'string')) throw new Error('AGENT_UI_INVALID_COMPOSER_DATA');
    if (entry.defaultTextPrefix !== undefined && typeof entry.defaultTextPrefix !== 'string') throw new Error('AGENT_UI_INVALID_COMPOSER_DATA');
    if (entry.defaultForwardedProps !== undefined && !record(entry.defaultForwardedProps)) throw new Error('AGENT_UI_INVALID_COMPOSER_DATA');
    const state = this.state(threadId);
    const key = crypto.randomUUID();
    const previous = Object.fromEntries(Object.entries(state.snapshot).filter(([, part]) =>
      part.owner !== owner || (entry.reference !== undefined && part.reference !== undefined)));
    const removed = Object.entries(state.snapshot).filter(([id]) => !(id in previous)).map(([, part]) => part);
    state.snapshot = { ...previous, [key]: entry };
    this.restoreReferences(state, removed);
    this.syncDraft(state);
    state.listeners.forEach(listener => listener());
    return () => {
      if (!Object.hasOwn(state.snapshot, key)) return;
      const removed = state.snapshot[key]!;
      const { [key]: _removed, ...remaining } = state.snapshot;
      state.snapshot = remaining;
      this.restoreReferences(state, [removed]);
      this.syncDraft(state);
      state.listeners.forEach(listener => listener());
    };
  }
  clearData(threadId: string, owner: string): void {
    this.removeData(threadId, entry => entry.owner === owner);
  }
  private removeData(threadId: string, matches: (entry: ComposerDataEntry) => boolean): void {
    const state = this.threads.get(threadId);
    if (!state) return;
    const removed = Object.values(state.snapshot).filter(matches);
    if (!removed.length) return;
    state.snapshot = Object.fromEntries(Object.entries(state.snapshot).filter(([, entry]) => !matches(entry)));
    this.restoreReferences(state, removed);
    this.syncDraft(state);
    state.listeners.forEach(listener => listener());
  }
  attach(threadId: string, runtime: AssistantRuntime): () => void {
    const state = this.state(threadId);
    state.native = runtime;
    this.syncDraft(state);
    let submitted: DataMap | undefined;
    const stopText = runtime.thread.composer.unstable_on('textChange', event => {
      if (event.origin === 'send') submitted = { ...state.snapshot };
      if (event.origin === 'reset') {
        state.snapshot = {}; state.seen.clear(); submitted = undefined;
        state.listeners.forEach(listener => listener());
      }
    });
    const stopSend = runtime.thread.composer.unstable_on('send', () => {
      const sent = submitted ?? state.snapshot;
      state.snapshot = Object.fromEntries(Object.entries(state.snapshot).filter(([key]) => !(key in sent)));
      submitted = undefined;
      state.seen.clear();
      // Let per-send endpoint/ctx scopes restore their original runConfig first.
      queueMicrotask(() => { if (!disposed) this.syncDraft(state); });
      state.listeners.forEach(listener => listener());
    });
    const unregister = runtime.registerModelContextProvider({
      getModelContext: () => {
        let snapshot = this.snapshot(state);
        let editing = false;
        // Native edit composers retain text/quote but not arbitrary custom metadata.
        for (const message of runtime.thread.getState().messages) {
          if (message.role !== 'user') continue;
          const edit = runtime.thread.getMessageById(message.id).composer.getState();
          if (!edit.isEditing) continue;
          if (!editing) { snapshot = {}; editing = true; }
          for (const [key, part] of Object.entries(entries(message, this.messageData))) {
            if (!part.reference || edit.text.includes(part.reference.token)) snapshot[key] = part;
          }
        }
        // Upstream may enrich a retry/queue at dispatch. Never overwrite submitted metadata here.
        return Object.keys(state.snapshot).length || editing
          ? { unstable_composerMetadata: { [draftMetadataKey]: snapshot,
            ...this.projectMetadata(snapshot), ...(editing ? { [editKey]: true } : {}) } } : {};
      },
      subscribe: listener => { state.listeners.add(listener); return () => state.listeners.delete(listener); },
    });
    let pending = false, disposed = false;
    const schedule = () => {
      const current = runtime.thread.composer.getState();
      if (!current.text && !current.submission && !record(current.runConfig.custom)?.[runConfigKey] && Object.keys(state.snapshot).length) {
        state.snapshot = {}; state.seen.clear();
        state.listeners.forEach(listener => listener());
      }
      if (pending || Object.keys(state.snapshot).length === 0) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        if (disposed) return;
        const composer = runtime.thread.composer.getState();
        const texts = [composer.text, composer.submission?.text ?? '', ...(composer.inTransit ?? []).map(item => item.text),
          ...composer.queue.map(item => item.prompt)];
        const submitted = new Set(runtime.thread.getState().messages.flatMap(message => {
          try { return Object.keys(entries(message, this.messageData)); } catch { return []; }
        }));
        const kept: DataMap = {};
        for (const [key, part] of Object.entries(state.snapshot)) {
          if (!part.reference) kept[key] = part;
          else if (texts.some(text => text.includes(part.reference!.token))) { kept[key] = part; state.seen.add(key); }
          else if (!submitted.has(key) && !state.seen.has(key)) kept[key] = part;
          else state.seen.delete(key);
        }
        if (Object.keys(kept).length !== Object.keys(state.snapshot).length) {
          state.snapshot = kept;
          state.listeners.forEach(listener => listener());
        }
      });
    };
    const stopThread = runtime.thread.subscribe(schedule);
    const stopComposer = runtime.thread.composer.subscribe(schedule);
    return () => {
      disposed = true; stopThread(); stopComposer(); stopSend(); stopText(); unregister();
      delete state.native; state.snapshot = {}; state.listeners.clear(); state.seen.clear();
      this.threads.delete(threadId);
      this.dataCache.delete(threadId);
      this.plans.delete(threadId);
    };
  }
  transformRequest(input: RunAgentInput, context: ConversationInputRequestContext): RunAgentInput {
    const last = input.messages.at(-1);
    const continuation = 'resume' in input || last?.role === 'tool' ||
      (typeof input.forwardedProps === 'object' && input.forwardedProps !== null && 'command' in input.forwardedProps);
    const native = readNativeInputSession(context.runtime)?.thread.getState().messages ?? [];
    const messages = [...context.submittedMessages.filter(isSubmittedUserMessage), ...native];
    const decorated = injectConversationQuoteContext(input, messages);
    let plan = this.plans.get(context.threadId);
    if (!continuation || !plan) {
      const userId = [...input.messages].reverse().find(message => message.role === 'user')?.id;
      const user = userId ? messages.find(message => message.role === 'user' && message.id === userId)
        : [...native].reverse().find(message => message.role === 'user');
      plan = user ? this.prepare(user, continuation ? undefined : input) : undefined;
      if (plan) this.plans.set(context.threadId, plan);
      else this.plans.delete(context.threadId);
    }
    return plan ? this.apply(decorated, plan) : decorated;
  }
  prepare(user: ThreadMessage, input?: RunAgentInput): ConversationRequestPlan {
    const config = record(record(input?.forwardedProps)?.runConfig);
    const captured = record(config?.[runConfigKey]);
    if (captured && !record(user.metadata.custom[metadataKey]) && user.metadata.custom[editKey] !== true) {
      // The native queue enriches model-context metadata at dispatch, whereas
      // runConfig is frozen at submission (including attachment preparation).
      // Bind our own private metadata namespace to that submitted snapshot before
      // any adapter runs. Text, attachments and upstream-owned metadata are untouched.
      user.metadata.custom[metadataKey] = structuredClone(captured);
    }
    let text = textOf(user);
    const groups = new Map<string, ComposerDataEntry[]>();
    const offsets = new Map<string, number>();
    const submitted = entries(user, this.messageData);
    user.metadata.custom[metadataKey] = structuredClone(submitted);
    const saved = Object.values(submitted);
    const messageMetadata = this.projectMetadata(submitted);
    for (const key of this.messageData?.metadataKeys ?? []) delete user.metadata.custom[key];
    for (const [key, value] of Object.entries(messageMetadata)) {
      Object.defineProperty(user.metadata.custom, key, { value, enumerable: true, configurable: true, writable: true });
    }
    const parts = saved.map(part => {
      const token = part.reference?.token;
      const position = token ? text.indexOf(token, offsets.get(token) ?? 0) : -1;
      if (token) offsets.set(token, position + token.length);
      return { part, position };
    }).sort((left, right) => left.position - right.position).map(value => value.part);
    let changed = false;
    const defaults: Record<string, ComposerData> = {};
    const prefixes = new Set<string>();
    let quotePrefix = '';
    for (const part of parts) {
      const active = part.enabled ?? ((!part.reference && !part.quote) || this.owners.has(part.owner));
      if (part.reference) {
        const replacement = active ? part.reference.text : part.reference.fallbackText;
        changed ||= replacement !== part.reference.token;
        text = text.split(part.reference.token).join(replacement);
      }
      if (active) {
        const key = part.owner;
        groups.set(key, [...(groups.get(key) ?? []), part]);
        if (part.defaultTextPrefix) prefixes.add(part.defaultTextPrefix);
        if (part.quote) quotePrefix = part.quote.text.split('\n').map(line => `> ${line}`).join('\n') + '\n\n';
        for (const [key, value] of Object.entries(part.defaultForwardedProps ?? {})) {
          const previous = record(defaults[key]), next = record(value);
          if (!this.adapters.size && Object.hasOwn(defaults, key) && (!previous || !next || Object.keys(next).some(field => Object.hasOwn(previous, field))))
            throw new Error('AGENT_UI_COMPOSER_DATA_CONFLICT');
          Object.defineProperty(defaults, key, { value: previous && next ? { ...previous, ...next } : value, enumerable: true, configurable: true });
        }
      }
    }
    const pluginData: Record<string, ComposerData> = Object.fromEntries([...groups].map(([owner, values]) =>
      [owner, values.some(value => value.reference) ? values.map(value => value.data) : values.at(-1)!.data]));
    const selections = Object.fromEntries([...groups].map(([owner, values]) =>
      [owner, values.flatMap(value => value.selection === undefined ? [] : [value.selection])]));
    const sources = Object.fromEntries([...groups].map(([owner, values]) => [owner, values.at(-1)!.source ?? {}]));
    const forwardedProps = Object.fromEntries([...groups].flatMap(([owner, values]) => {
      const sent = values.filter(value => value.includeInRequest === true);
      return sent.length ? [[owner, sent.some(value => value.reference) ? sent.map(value => value.data) : sent.at(-1)!.data]] : [];
    }));
    return { messageMetadata, metadataKeys: [...this.messageData?.metadataKeys ?? []], userId: user.id, sourceText: textOf(user), text: changed ? text.trim() : text, pluginData, selections, sources,
      forwardedProps, adapter: this.adapters.values().next().value,
      defaultForwardedProps: defaults, textPrefix: [...prefixes].join(''), quotePrefix };
  }
  apply(input: RunAgentInput, plan: ConversationRequestPlan): RunAgentInput {
    const props = record(input.forwardedProps) ?? {};
    const nativeConfig = record(props.runConfig);
    const { runConfig: _config, ...otherProps } = props;
    const { [runConfigKey]: _private, ...custom } = nativeConfig ?? {};
    // Native configuration is internal; business fields use the public ctx envelope.
    const forwardedProps = nativeConfig ? { ...otherProps,
      ...(Object.keys(custom).length ? { ctx: { ...custom, ...record(otherProps.ctx) } } : {}) } : props;
    const defaults = Object.fromEntries(Object.entries(plan.defaultForwardedProps).map(([key, value]) => {
      const previous = record(forwardedProps[key]), next = record(value);
      return [key, previous && next ? { ...previous, ...next } : value];
    }));
    const request = { ...input,
      messages: input.messages.map(originalMessage => {
        let message = publicMessage(originalMessage);
        if (message.role === 'user' && message.id === plan.userId) {
          const metadata = { ...record(message.metadata) };
          for (const key of plan.metadataKeys) delete metadata[key];
          message = { ...message, metadata: { ...metadata, ...plan.messageMetadata } };
        }
        if (message.role !== 'user' || message.id !== plan.userId || (plan.text === plan.sourceText && !plan.quotePrefix && !plan.textPrefix)) return message;
        const wireText = typeof message.content === 'string' ? message.content
          : message.content.filter(part => part.type === 'text').map(part => part.text).join('');
        const original = plan.quotePrefix && wireText.startsWith(plan.quotePrefix) ? wireText.slice(plan.quotePrefix.length) : wireText;
        const changed = plan.textPrefix + (original.endsWith(plan.sourceText)
          ? original.slice(0, original.length - plan.sourceText.length) + plan.text : plan.text);
        if (typeof message.content === 'string') return { ...message, content: changed };
        let replaced = false;
        return { ...message, content: message.content.map(part => {
          if (part.type !== 'text') return part;
          if (replaced) return { ...part, text: '' };
          replaced = true; return { ...part, text: changed };
        }) };
      }),
      forwardedProps: Object.fromEntries([
        ...Object.entries(structuredClone(plan.forwardedProps)), ...Object.entries(forwardedProps), ...Object.entries(defaults),
      ]),
    };
    if (!plan.adapter) {
      if (Object.keys(plan.forwardedProps).some(key => Object.hasOwn(forwardedProps, key)))
        throw new Error('AGENT_UI_COMPOSER_DATA_CONFLICT');
      return request;
    }
    const result: unknown = plan.adapter({ request: structuredClone(request),
      pluginData: structuredClone(plan.pluginData), selections: structuredClone(plan.selections), sources: structuredClone(plan.sources) });
    // Validate without replacing the user's JSON with Schema defaults or stripping extension fields.
    json(result);
    RunAgentInputSchema.parse(result);
    return result as RunAgentInput;
  }
}
