import { HttpAgent, type RunAgentInput } from '@ag-ui/client';
import { useAui, type AssistantRuntime, type AttachmentAdapter, type CompleteAttachment } from '@assistant-ui/react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { ConversationRuntimeProvider, useConversationRuntimeBridge, type ConversationRuntimeBridge, type ConversationLoadedThread } from '../src/public.js';
import { useComposer, useComposerRequestAdapter, type ComposerRequestAdapter, type ComposerData, type ComposerDataOptions } from '../src/plugin-api/request.js';
import type { AgentFrontendToolSource } from '@za38.03/agent-ui-core';

let tree: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined; });
async function until(predicate: () => boolean) {
  for (let index = 0; index < 150; index++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error('Plugin request fixture did not settle');
}
type Callback = ComposerRequestAdapter;
async function fixture(callback: Callback | undefined, options: { hold?: boolean; interrupt?: boolean; history?: ConversationLoadedThread; tools?: AgentFrontendToolSource; attachmentAdapter?: AttachmentAdapter } = {}) {
  const errors = vi.fn();
  const runs: { input: RunAgentInput; emit(event: Record<string, unknown>): void; finish(): void }[] = [];
  let native!: AssistantRuntime, bridge!: ConversationRuntimeBridge;
  let composer!: ReturnType<typeof useComposer>;
  let second!: ReturnType<typeof useComposer>;
  let active = 'A';
  const binding = {
    getThreadId: () => active, activateThread: (id: string) => { active = id; }, subscribe: () => () => {},
    createNewThread: async () => crypto.randomUUID(),
    getThreadListSnapshot: () => ({ threads: [{ id: 'A', status: 'regular' as const }, { id: 'B', status: 'regular' as const }], archivedThreads: [] }),
    loadThread: async (id: string) => id === 'A' ? options.history ?? { messages: [] } : { messages: [] },
  };
  function Capture() {
    native = useAui().threads.__internal_getAssistantRuntime!(); bridge = useConversationRuntimeBridge();
    composer = useComposer('test');
    second = useComposer('other');
    useComposerRequestAdapter(callback ? input => callback!(input) : undefined);
    return null;
  }
  const factory = ({ threadId }: { threadId: string }) => new HttpAgent({ url: 'http://example.test/agent', threadId,
    fetch: async (_url, init) => {
      const input = JSON.parse(String(init.body)) as RunAgentInput;
      const index = runs.length;
      const messageId = `answer-${input.threadId}-${index}`;
      let controller!: ReadableStreamDefaultController<Uint8Array>, ended = false;
      const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
      const emit = (event: Record<string, unknown>) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
      const finish = () => {
        emit({ type: 'TEXT_MESSAGE_END', messageId });
        emit({ type: 'RUN_FINISHED', threadId: input.threadId, runId: input.runId,
          outcome: options.interrupt && index === 0 ? { type: 'interrupt', interrupts: [{ id: 'confirm', reason: 'confirmation' }] } : { type: 'success' } });
        ended = true; controller.close();
      };
      runs.push({ input, emit, finish });
      emit({ type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId });
      emit({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' });
      emit({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: 'Answer' });
      if (!options.hold) finish();
      init.signal?.addEventListener('abort', () => { if (!ended) { ended = true; controller.error(new Error('Cancelled')); } }, { once: true });
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
    },
  });
  await act(async () => { tree = create(<ConversationRuntimeProvider endpoint='http://example.test/agent' threadBinding={binding}
    enableMessageQueue attachmentAdapter={options.attachmentAdapter} frontendTools={options.tools} ctx={{ tenant: 'host' }} onError={errors} unstable_agentFactory={factory}>
    <Capture />
  </ConversationRuntimeProvider>); });
  await until(() => !native.thread.getState().isLoading);
  return {
    runs, errors, get native() { return native; }, get bridge() { return bridge; },
    update(next: Callback) { callback = next; },
    async select(data: ComposerData, fallbackText = ':user[Person]{name=business}') {
      const token = `:user[Person]{name=agent-ui-selection-${crypto.randomUUID()}}`;
      await act(async () => { composer.setData(data, { reference: { token, fallbackText, text: '' }, selection: data }); });
      return token;
    },
    setData(data: ComposerData, options?: ComposerDataOptions) { composer.setData(data, options); },
    secondData(data: ComposerData, options?: ComposerDataOptions) { second.setData(data, options); },
    clearData() { composer.clearData(); },
    get composer() { return composer; },
    async send(text: string) { await act(async () => { native.thread.composer.setText(text); native.thread.composer.send(); }); },
    async settle(count: number) { await until(() => runs.length === count && !native.thread.getState().isRunning); },
    async close() { await act(async () => tree!.unmount()); tree = undefined; },
  };
}
const external: Callback = ({ request, pluginData }) => ({ ...request, forwardedProps: { ctx: { selected: pluginData['standalone:test'] ?? [] } } });

it('gives the final adapter defaults, Plugin data and raw selections; never merges afterwards', async () => {
  const callback = vi.fn<Callback>(external);
  const f = await fixture(callback);
  const item = { id: 'one', nested: { value: 'original' } };
  const token = await f.select(item);
  item.nested.value = 'mutated';
  await f.send(`${token} Question`); await f.settle(1);
  const received = callback.mock.calls[0]![0];
  expect(received.pluginData).toEqual({ 'standalone:test': [{ id: 'one', nested: { value: 'original' } }] });
  expect(received.selections).toEqual(received.pluginData);
  expect(received.request.forwardedProps).toHaveProperty('ctx', { tenant: 'host' });
  expect(f.runs[0]!.input.forwardedProps).toEqual({ ctx: { selected: [{ id: 'one', nested: { value: 'original' } }] } });
  expect(f.runs[0]!.input.messages[0]!.content).toBe('Question');
  expect(JSON.stringify(f.runs[0]!.input)).not.toContain('agent-ui-selection-');
  expect(JSON.stringify(f.runs[0]!.input)).not.toContain('agentUIComposerData');
  await f.send('Next'); await f.settle(2);
  expect(callback.mock.calls[1]![0].pluginData).toEqual({});
});

it('defaults to namespaced data, preserves Host fields, and lets a Plugin replace or clear its own value', async () => {
  const f = await fixture(undefined);
  await act(async () => { f.setData({ old: true }); f.setData({ value: [1, null, false] }); f.secondData('independent'); });
  await f.send('Default'); await f.settle(1);
  expect(f.runs[0]!.input.forwardedProps).toEqual({ ctx: { tenant: 'host' }, 'standalone:test': { value: [1, null, false] }, 'standalone:other': 'independent' });
  await act(async () => { f.setData({ removed: true }); f.clearData(); });
  await f.send('Clean'); await f.settle(2);
  expect(f.runs[1]!.input.forwardedProps).toEqual({ ctx: { tenant: 'host' } });
});

it('can remove every forwarded field, including native business fields, or place data under an arbitrary key', async () => {
  const f = await fixture(({ request }) => ({ ...request, forwardedProps: {} }));
  await act(async () => { f.composer.setRunConfig({ custom: { native: true } }); f.setData({ id: 'e1' }); });
  await f.send('Empty'); await f.settle(1);
  expect(f.runs[0]!.input.forwardedProps).toEqual({});
  f.update(({ request, pluginData }) => ({ ...request, forwardedProps: { business: pluginData } }));
  await act(async () => f.setData({ id: 'e2' }));
  await f.send('Custom'); await f.settle(2);
  expect(f.runs[1]!.input.forwardedProps).toEqual({ business: { 'standalone:test': { id: 'e2' } } });
});

it('normalizes native business fields into ctx before the final adapter without exposing internal configuration', async () => {
  const adapter = vi.fn<Callback>(({ request }) => request);
  const f = await fixture(adapter);
  await act(async () => f.composer.setRunConfig({ custom: { tenant: 'native', nativeField: true } }));
  await f.send('Native fields'); await f.settle(1);
  expect(f.runs[0]!.input.forwardedProps).toEqual({ ctx: { tenant: 'host', nativeField: true } });
  expect(adapter.mock.calls[0]![0].request.forwardedProps).toEqual({ ctx: { tenant: 'host', nativeField: true } });
  expect(f.native.thread.composer.getState().runConfig.custom).toEqual({ tenant: 'native', nativeField: true });
});

it('keeps default reference text while making the raw selection available to a custom adapter', async () => {
  const callback = vi.fn<Callback>(({ request }) => request);
  const f = await fixture(callback);
  const token = ':user[Person]{name=employee}';
  await act(async () => f.setData({ id: 'employee' }, { reference: { token, text: token, fallbackText: token }, selection: { id: 'employee' }, includeInRequest: false }));
  await f.send(`${token} Question`); await f.settle(1);
  expect(f.runs[0]!.input.messages[0]!.content).toBe(`${token} Question`);
  expect(f.runs[0]!.input.forwardedProps).toEqual({ ctx: { tenant: 'host' } });
  expect(callback.mock.calls[0]![0].selections['standalone:test']).toEqual([{ id: 'employee' }]);
});

it('recomputes edit/reload and excludes removed references', async () => {
  const f = await fixture(external);
  const one = await f.select({ id: 'one' }), two = await f.select({ id: 'two' });
  await f.send(`${one} ${two} Question`); await f.settle(1);
  await act(async () => f.native.thread.getMessageById('answer-A-0').reload()); await f.settle(2);
  expect(f.runs[1]!.input.forwardedProps).toEqual({ ctx: { selected: [{ id: 'one' }, { id: 'two' }] } });
  const user = f.native.thread.getState().messages.find(message => message.role === 'user')!;
  await act(async () => {
    const edit = f.native.thread.getMessageById(user.id).composer;
    edit.beginEdit(); edit.setText(`${two} Edited`); edit.send();
  });
  await f.settle(3);
  expect(f.runs[2]!.input.messages[0]!.content).toBe('Edited');
  expect(f.runs[2]!.input.forwardedProps).toEqual({ ctx: { selected: [{ id: 'two' }] } });
});

it('rejects invalid JSON before changing the draft data', async () => {
  const f = await fixture(undefined);
  await act(async () => f.setData({ valid: true }));
  expect(() => f.setData({ value: Number.NaN })).toThrow();
  const cyclic: Record<string, ComposerData> = {}; cyclic.self = cyclic;
  expect(() => f.setData(cyclic)).toThrow();
  await f.send('Valid'); await f.settle(1);
  expect(f.runs[0]!.input.forwardedProps).toHaveProperty('standalone:test', { valid: true });
});

it('fails closed for throwing or asynchronous adapters and allows retry after correction', async () => {
  const f = await fixture(() => { throw new Error('Project callback failed'); });
  const token = await f.select({ id: 'one' });
  await f.send(`${token} Question`);
  await until(() => f.errors.mock.calls.length > 0 && !f.native.thread.getState().isRunning);
  expect(f.runs).toHaveLength(0);
  const invalid: unknown = () => Promise.resolve({});
  f.update(invalid as Callback);
  let assistant = f.native.thread.getState().messages.find(message => message.role === 'assistant')!;
  await act(async () => f.native.thread.getMessageById(assistant.id).reload());
  await until(() => f.errors.mock.calls.length > 1 && !f.native.thread.getState().isRunning);
  expect(f.runs).toHaveLength(0);
  f.update(external);
  assistant = f.native.thread.getState().messages.find(message => message.role === 'assistant')!;
  await act(async () => f.native.thread.getMessageById(assistant.id).reload()); await f.settle(1);
  expect(f.runs[0]!.input.forwardedProps).toEqual({ ctx: { selected: [{ id: 'one' }] } });
});

it('restores original data for an interrupt resume without reading the next draft', async () => {
  const f = await fixture(external, { interrupt: true });
  const token = await f.select({ id: 'saved' });
  await f.send(`${token} Original`); await f.settle(1);
  const history: ConversationLoadedThread = { messages: f.native.thread.getState().messages as unknown as ConversationLoadedThread['messages'] };
  await f.close();
  const restored = await fixture(external, { history });
  await until(() => restored.bridge.agentRuntime.getSnapshot().run.status === 'awaiting-input');
  await act(async () => { restored.native.thread.composer.setText('Unsent next draft'); restored.setData({ id: 'next' }); });
  let task!: Promise<void>;
  await act(async () => { task = restored.bridge.agentRuntime.resumeInterrupts([{ interruptId: 'confirm', status: 'resolved' }]); });
  await restored.settle(1); await task;
  expect(restored.runs[0]!.input.messages).toEqual([]);
  expect(restored.runs[0]!.input).toHaveProperty('resume');
  expect(restored.runs[0]!.input.forwardedProps).toEqual({ ctx: { selected: [{ id: 'saved' }] } });
  expect(restored.native.thread.composer.getState().text).toBe('Unsent next draft');
});

it('snapshots queued data through tool continuation while another Thread runs', async () => {
  let resolveTool!: (result: { content: string }) => void;
  let executing = false;
  const tools: AgentFrontendToolSource = {
    listTools: () => [{ name: 'confirm', description: 'Confirm', inputSchema: { type: 'object', properties: {} } }],
    subscribe: () => () => {}, getRevision: () => 0,
    execute: () => { executing = true; return new Promise(resolve => { resolveTool = resolve; }); },
  };
  const f = await fixture(external, { hold: true, tools });
  const first = await f.select({ id: 'first' });
  await f.send(`${first} First`); await until(() => f.runs.length === 1);
  await act(async () => {
    f.runs[0]!.emit({ type: 'TOOL_CALL_START', toolCallId: 'confirm-1', toolCallName: 'confirm', parentMessageId: 'answer-A-0' });
    f.runs[0]!.emit({ type: 'TOOL_CALL_ARGS', toolCallId: 'confirm-1', delta: '{}' });
    f.runs[0]!.emit({ type: 'TOOL_CALL_END', toolCallId: 'confirm-1' });
    f.runs[0]!.finish();
  });
  await until(() => executing);
  const queued = await f.select({ id: 'queued' }); await f.send(`${queued} Queued`);
  await act(async () => f.native.threads.switchToThread('B'));
  await until(() => !f.native.thread.getState().isLoading);
  const other = await f.select({ id: 'other' }); await f.send(`${other} Other`);
  await until(() => f.runs.length === 2);
  expect(f.runs[1]!.input.forwardedProps).toEqual({ ctx: { selected: [{ id: 'other' }] } });
  await act(async () => resolveTool({ content: 'confirmed' })); await until(() => f.runs.length === 3);
  expect(f.runs[2]!.input.messages).toMatchObject([{ role: 'tool', content: 'confirmed' }]);
  expect(f.runs[2]!.input.forwardedProps).toEqual({ ctx: { selected: [{ id: 'first' }] } });
  await act(async () => f.runs[2]!.finish()); await until(() => f.runs.length === 4);
  expect(f.runs[3]!.input.forwardedProps).toEqual({ ctx: { selected: [{ id: 'queued' }] } });
  await act(async () => { f.runs[1]!.finish(); f.runs[3]!.finish(); });
});

it('snapshots unbound third-party data for multiple queued drafts and clears it afterwards', async () => {
  const f = await fixture(({ request }) => request, { hold: true });
  await act(async () => f.setData({ draft: 'first' }));
  await f.send('First'); await until(() => f.runs.length === 1);
  await act(async () => f.setData({ draft: 'second' }));
  await f.send('Second');
  await act(async () => f.setData({ draft: 'third' }));
  await f.send('Third');
  await act(async () => f.runs[0]!.finish()); await until(() => f.runs.length === 2);
  expect(f.runs[1]!.input.forwardedProps).toHaveProperty('standalone:test', { draft: 'second' });
  await act(async () => f.runs[1]!.finish()); await until(() => f.runs.length === 3);
  expect(f.runs[2]!.input.forwardedProps).toHaveProperty('standalone:test', { draft: 'third' });
  await act(async () => f.runs[2]!.finish()); await f.settle(3);
  await f.send('Clean'); await until(() => f.runs.length === 4);
  expect(f.runs[3]!.input.forwardedProps).toEqual({ ctx: { tenant: 'host' } });
  await act(async () => f.runs[3]!.finish());
});

it('keeps the next unbound draft out of an edit and restores unbound data from native history', async () => {
  const callback = vi.fn<Callback>(({ request }) => request);
  const f = await fixture(callback);
  await act(async () => f.setData({ draft: 'original' }));
  await f.send('Original'); await f.settle(1);
  await act(async () => { f.setData({ draft: 'next' }); f.secondData({ nextOnly: true }); f.composer.setText('Next draft'); });
  const user = f.native.thread.getState().messages.find(message => message.role === 'user')!;
  await act(async () => {
    const edit = f.native.thread.getMessageById(user.id).composer;
    edit.beginEdit(); edit.setText('Edited original'); edit.send();
  });
  await f.settle(2);
  expect(f.runs[1]!.input.forwardedProps).toEqual({ ctx: { tenant: 'host' }, 'standalone:test': { draft: 'original' } });
  expect(f.native.thread.composer.getState().text).toBe('Next draft');
  const history: ConversationLoadedThread = { messages: f.native.thread.getState().messages as unknown as ConversationLoadedThread['messages'] };
  await f.close();
  const restored = await fixture(({ request }) => request, { history });
  await act(async () => restored.native.thread.getMessageById('answer-A-1').reload()); await restored.settle(1);
  expect(restored.runs[0]!.input.forwardedProps).toEqual({ ctx: { tenant: 'host' }, 'standalone:test': { draft: 'original' } });
});

it('keeps a retained useComposer handle bound to its original Thread', async () => {
  const f = await fixture(({ request }) => request);
  const first = f.composer;
  await act(async () => f.native.threads.switchToThread('B'));
  await until(() => !f.native.thread.getState().isLoading);
  await act(async () => { first.setData({ background: 'A' }); first.setText('Draft in A'); });
  expect(f.native.thread.composer.getState().text).toBe('');
  await f.send('B'); await f.settle(1);
  expect(f.runs[0]!.input.forwardedProps).toEqual({ ctx: { tenant: 'host' } });
  await act(async () => f.native.threads.switchToThread('A'));
  await until(() => !f.native.thread.getState().isLoading);
  expect(f.native.thread.composer.getState().text).toBe('Draft in A');
  await f.send('A'); await f.settle(2);
  expect(f.runs[1]!.input.forwardedProps).toHaveProperty('standalone:test', { background: 'A' });
});


it('clears data when the native composer is reset, including an empty text draft', async () => {
  const f = await fixture(undefined);
  await act(async () => f.setData({ removed: true }));
  await act(async () => { await f.native.thread.composer.reset(); });
  await f.send('After reset'); await f.settle(1);
  expect(f.runs[0]!.input.forwardedProps).toEqual({ ctx: { tenant: 'host' } });
});

it('keeps attachment submission data fixed while preserving data for the next draft', async () => {
  let release!: (attachment: CompleteAttachment) => void;
  const adapter: AttachmentAdapter = {
    accept: 'text/plain',
    async add({ file }) {
      return { id: 'upload', type: 'document', name: file.name, contentType: file.type, file,
        status: { type: 'requires-action', reason: 'composer-send' } };
    },
    async remove() {},
    send() {
      return new Promise(resolve => { release = resolve; });
    },
  };
  const f = await fixture(({ request }) => request, { attachmentAdapter: adapter });
  await act(async () => { await f.native.thread.composer.addAttachment(new File(['file'], 'file.txt', { type: 'text/plain' })); });
  await act(async () => f.setData({ draft: 'upload' }));
  await f.send('Upload');
  await until(() => release !== undefined);
  await act(async () => { f.setData({ draft: 'next' }); f.composer.setText('Next'); });
  await act(async () => release({ id: 'upload', type: 'document', name: 'file.txt', contentType: 'text/plain',
    status: { type: 'complete' }, content: [{ type: 'file', data: 'ZmlsZQ==', mimeType: 'text/plain', filename: 'file.txt' }] }));
  await f.settle(1);
  expect(f.runs[0]!.input.forwardedProps).toHaveProperty('standalone:test', { draft: 'upload' });
  expect(f.native.thread.composer.getState().text).toBe('Next');
  await f.send('Next'); await f.settle(2);
  expect(f.runs[1]!.input.forwardedProps).toHaveProperty('standalone:test', { draft: 'next' });
});

it('restores a private reference to its public fallback when clearing its draft data', async () => {
  const f = await fixture(undefined);
  const token = await f.select({ id: 'one' });
  await act(async () => { f.composer.setText(`${token} Question`); f.clearData(); });
  expect(f.native.thread.composer.getState().text).toBe(':user[Person]{name=business} Question');
  await f.send(f.native.thread.composer.getState().text); await f.settle(1);
  expect(f.runs[0]!.input.forwardedProps).toEqual({ ctx: { tenant: 'host' } });
  expect(JSON.stringify(f.runs[0]!.input)).not.toContain('agent-ui-selection-');
});

it('lets per-send configuration scopes restore themselves when Plugin data is present', async () => {
  const { withConversationSendOptions } = await import('../src/compatibility/conversation-request-routing.js');
  const f = await fixture(({ request }) => request);
  await act(async () => {
    f.setData({ id: 'one' });
    f.composer.setText('Scoped');
    const native = f.native.thread.composer;
    const original = native.getState().runConfig;
    const temporary = withConversationSendOptions(original, { ctx: { source: 'once' } });
    native.setRunConfig(temporary);
    native.send();
    if (native.getState().runConfig === temporary) native.setRunConfig(original);
  });
  await f.settle(1);
  expect(f.runs[0]!.input.forwardedProps).toEqual({ ctx: { tenant: 'host', source: 'once' }, 'standalone:test': { id: 'one' } });
  await f.send('Next'); await f.settle(2);
  expect(f.runs[1]!.input.forwardedProps).toEqual({ ctx: { tenant: 'host' } });
});


it('assembles default fields without changing native business configuration and lets the final adapter remove them', async () => {
  const f = await fixture(({ request }) => request);
  await act(async () => {
    f.composer.setRunConfig({ custom: { keep: 'host', skillId: 'original' } });
    f.setData({ operation: 'research' }, { includeInRequest: false,
      defaultForwardedProps: { ctx: { skillId: 'research' } }, selection: { id: 'research' } });
  });
  expect(f.native.thread.composer.getState().runConfig.custom?.skillId).toBe('original');
  await f.send('Default skill'); await f.settle(1);
  expect(f.runs[0]!.input.forwardedProps).toEqual({ ctx: { keep: 'host', skillId: 'research', tenant: 'host' } });
  expect(f.native.thread.composer.getState().runConfig.custom).toEqual({ keep: 'host', skillId: 'original' });
  f.update(({ request }) => ({ ...request, forwardedProps: {} }));
  await act(async () => f.setData({ operation: 'research' }, { includeInRequest: false, defaultForwardedProps: { ctx: { skillId: 'research' } } }));
  await f.send('Override'); await f.settle(2);
  expect(f.runs[1]!.input.forwardedProps).toEqual({});
});

it('composes quote defaults with other data and excludes dismissed quotes on edit', async () => {
  const callback = vi.fn<Callback>(({ request }) => request);
  const f = await fixture(callback);
  const quote = { text: 'Passage\nSecond line', messageId: 'source' };
  const token = await f.select({ id: 'person' });
  await act(async () => {
    f.composer.setQuote(quote);
    f.secondData(quote, { quote, selection: quote, includeInRequest: false, defaultTextPrefix: '> Passage\n> Second line\n\n' });
  });
  await f.send(`${token} Question`); await f.settle(1);
  expect(f.runs[0]!.input.messages[0]!.content).toBe('> Passage\n> Second line\n\nQuestion');
  expect(callback.mock.calls[0]![0].pluginData['standalone:other']).toEqual(quote);
  const user = f.native.thread.getState().messages.find(message => message.role === 'user')!;
  await act(async () => {
    const edit = f.native.thread.getMessageById(user.id).composer;
    edit.beginEdit(); edit.setQuote(undefined); edit.setText('Edited'); edit.send();
  });
  await f.settle(2);
  expect(f.runs[1]!.input.messages[0]!.content).toBe('Edited');
  expect(callback.mock.calls[1]![0].pluginData).toEqual({});
});

it('releases only the setData snapshot that created the disposer', async () => {
  const f = await fixture(undefined);
  let release!: () => void;
  await act(async () => {
    release = f.composer.setData({ old: true });
    f.composer.setData({ next: true });
    f.secondData('independent');
    release();
  });
  await f.send('Newest'); await f.settle(1);
  expect(f.runs[0]!.input.forwardedProps).toEqual({ ctx: { tenant: 'host' }, 'standalone:test': { next: true }, 'standalone:other': 'independent' });
});

it('lets the final adapter resolve overlapping Plugin defaults using their separate data', async () => {
  const callback = vi.fn<Callback>(({ request, pluginData }) => ({ ...request, forwardedProps: { selected: pluginData } }));
  const f = await fixture(callback);
  await act(async () => {
    f.setData({ one: true }, { includeInRequest: false, defaultForwardedProps: { ctx: { same: 'one' } } });
    f.secondData({ two: true }, { includeInRequest: false, defaultForwardedProps: { ctx: { same: 'two' } } });
  });
  await f.send('Resolve'); await f.settle(1);
  expect(f.runs[0]!.input.forwardedProps).toEqual({ selected: { 'standalone:test': { one: true }, 'standalone:other': { two: true } } });
});
