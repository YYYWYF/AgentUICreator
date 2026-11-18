import type { Message, RunAgentInput } from '@ag-ui/client';
import { RunAgentInputSchema } from '@ag-ui/core/schemas';
import type { AssistantRuntime, ThreadMessage } from '@assistant-ui/react';
import { snapshotAgentUIContext } from '@za38.03/agent-ui-core';
import type { ConversationComposerRunConfig } from '../plugin-api/composer.js';
import type { ComposerData, ComposerDataEntry, ComposerDataOptions, ComposerDataPort, ComposerRequestAdapter } from '../plugin-api/request.js';

const metadataKey = 'agentUIComposerData';
const editKey = 'agentUIComposerDataEdit';
const runConfigKey = '__agentUIComposerData';
type DataMap = Record<string, ComposerDataEntry>;
interface ThreadData {
  snapshot: DataMap;
  seen: Set<string>;
  listeners: Set<() => void>;
  native?: AssistantRuntime;
}
export interface ConversationRequestPlan {
  userId: string;
  sourceText: string;
  text: string;
  pluginData: Record<string, ComposerData>;
  selections: Record<string, ComposerData[]>;
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
  if (!metadata || (!(metadataKey in metadata) && !(editKey in metadata))) return message;
  const { [metadataKey]: _private, [editKey]: _edit, ...rest } = metadata;
  return { ...message, metadata: rest };
}
function entries(message: ThreadMessage): DataMap {
  const values = record(message.metadata.custom[metadataKey]);
  if (!values) return {};
  const text = textOf(message);
  const offsets = new Map<string, number>();
  return Object.fromEntries(Object.entries(values).flatMap(([key, candidate]) => {
    const entry = record(candidate);
    if (!entry || typeof entry.owner !== 'string' || !Object.hasOwn(entry, 'data')) throw new Error('AGENT_UI_INVALID_COMPOSER_DATA');
    if ((entry.enabled !== undefined && typeof entry.enabled !== 'boolean') ||
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
  private readonly owners = new Map<string, number>();
  private readonly adapters = new Map<string, ComposerRequestAdapter>();
  private readonly threads = new Map<string, ThreadData>();
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
      [key, { ...structuredClone(entry), enabled: this.owners.has(entry.owner) }]));
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
    if (!Object.keys(state.snapshot).length && !Object.hasOwn(config.custom ?? {}, runConfigKey)) return;
    const { [runConfigKey]: _private, ...custom } = config.custom ?? {};
    composer.setRunConfig({ ...config, custom: { ...custom,
      ...(Object.keys(state.snapshot).length ? { [runConfigKey]: this.snapshot(state) } : {}),
    } });
  }
  setRunConfig(threadId: string, config: ConversationComposerRunConfig): void {
    const state = this.state(threadId);
    state.native?.thread.composer.setRunConfig({ ...config, custom: { ...config.custom,
      ...(Object.keys(state.snapshot).length ? { [runConfigKey]: this.snapshot(state) } : {}),
    } });
  }
  register(owner: string): () => void {
    this.owners.set(owner, (this.owners.get(owner) ?? 0) + 1);
    if (this.owners.get(owner) === 1) this.refreshOwner(owner);
    return () => {
      const count = (this.owners.get(owner) ?? 1) - 1;
      if (count) this.owners.set(owner, count);
      else { this.owners.delete(owner); this.refreshOwner(owner); }
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
  setData(threadId: string, owner: string, data: ComposerData, options: ComposerDataOptions = {}): () => void {
    const entry = json({ ...options, owner, data }) as unknown as ComposerDataEntry;
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
    const state = this.state(threadId);
    const removed = Object.values(state.snapshot).filter(entry => entry.owner === owner);
    if (!removed.length) return;
    state.snapshot = Object.fromEntries(Object.entries(state.snapshot).filter(([, entry]) => entry.owner !== owner));
    this.restoreReferences(state, removed);
    this.syncDraft(state);
    state.listeners.forEach(listener => listener());
  }
  attach(threadId: string, runtime: AssistantRuntime): () => void {
    const state = this.state(threadId);
    state.native = runtime;
    if (Object.keys(state.snapshot).length) this.syncDraft(state);
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
          for (const [key, part] of Object.entries(entries(message))) {
            if (!part.reference || edit.text.includes(part.reference.token)) snapshot[key] = part;
          }
        }
        return Object.keys(snapshot).length || editing
          ? { unstable_composerMetadata: { [metadataKey]: snapshot, ...(editing ? { [editKey]: true } : {}) } } : {};
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
          try { return Object.keys(entries(message)); } catch { return []; }
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
    };
  }
  prepare(user: ThreadMessage, input?: RunAgentInput): ConversationRequestPlan {
    const config = record(record(input?.forwardedProps)?.runConfig);
    const captured = record(config?.[runConfigKey]);
    if (captured && user.metadata.custom[editKey] !== true) {
      // The native queue enriches model-context metadata at dispatch, whereas
      // runConfig is frozen at submission (including attachment preparation).
      // Bind our own private metadata namespace to that submitted snapshot before
      // any adapter runs. Text, attachments and upstream-owned metadata are untouched.
      user.metadata.custom[metadataKey] = structuredClone(captured);
    }
    let text = textOf(user);
    const groups = new Map<string, ComposerDataEntry[]>();
    const offsets = new Map<string, number>();
    const parts = Object.values(entries(user)).map(part => {
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
      const active = part.enabled ?? this.owners.has(part.owner);
      if (part.reference) {
        const replacement = active ? part.reference.text : part.reference.fallbackText;
        changed ||= replacement !== part.reference.token;
        text = text.split(part.reference.token).join(replacement);
      }
      if (active) {
        groups.set(part.owner, [...(groups.get(part.owner) ?? []), part]);
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
    const forwardedProps = Object.fromEntries([...groups].flatMap(([owner, values]) => {
      const sent = values.filter(value => value.includeInRequest !== false);
      return sent.length ? [[owner, sent.some(value => value.reference) ? sent.map(value => value.data) : sent.at(-1)!.data]] : [];
    }));
    return { userId: user.id, sourceText: textOf(user), text: changed ? text.trim() : text, pluginData, selections,
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
        const message = publicMessage(originalMessage);
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
      pluginData: structuredClone(plan.pluginData), selections: structuredClone(plan.selections) });
    // Validate without replacing the user's JSON with Schema defaults or stripping extension fields.
    json(result);
    RunAgentInputSchema.parse(result);
    return result as RunAgentInput;
  }
}
