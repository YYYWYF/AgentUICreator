// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AuiIf, AssistantRuntimeProvider, useLocalRuntime, useAui, type AssistantRuntime } from '@assistant-ui/react';
import { ConversationComposerDataContext } from '@za38.03/agent-ui-runtime/plugin-api';
import { ConversationRequestPartsRuntime } from '../../runtime/src/conversation-support/conversation-request-parts';
import { HttpAgent, type RunAgentInput } from '@ag-ui/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationRuntimeProvider, createEphemeralConversationThreadBinding } from '@za38.03/agent-ui-runtime';
import { AgentUIRoot, AgentUILocaleProvider, ConversationCanonicalComposer, type ComposerRequestAdapter,
  type ConversationSuggestionRequestAdapter, type ConversationSuggestionItem, ConversationThread, ConversationFollowupSuggestions } from '../src/public';
import { ConversationSuggestionsPlugin as NpmSuggestions } from '../dist/conversation-suggestions/index.js';
import { ConversationSuggestionsPlugin as SourceSuggestions } from '../dist/sources/takeover/conversation-suggestions/index';
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); });
async function until(predicate: () => boolean) {
  for (let index = 0; index < 100; index++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error('Suggestion fixture did not settle');
}
describe.each([{ name: 'npm', Suggestions: NpmSuggestions }, { name: 'portable', Suggestions: SourceSuggestions }])('$name suggestion data', ({ Suggestions }) => {
async function fixture(options: { items?: readonly ConversationSuggestionItem[]; dynamic?: boolean; send?: boolean; hold?: boolean; hideOnSubmit?: boolean;
  adapter?: ConversationSuggestionRequestAdapter; composerAdapter?: ComposerRequestAdapter; prevent?: boolean } = {}) {
  const requests: RunAgentInput[] = [];
  const finish: (() => void)[] = [];
  let runtime!: AssistantRuntime;
  const binding = createEphemeralConversationThreadBinding();
  const factory = () => new HttpAgent({ url: 'http://example.test/agent', fetch: async (_url, init) => {
    const input = JSON.parse(String(init.body)) as RunAgentInput; requests.push(input);
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
    const emit = (event: Record<string, unknown>) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
    emit({ type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId });
    const done = () => { emit({ type: 'RUN_FINISHED', threadId: input.threadId, runId: input.runId }); controller.close(); };
    finish.push(done); if (!options.hold) done();
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
  } });
  function Capture() { runtime = useAui().threads.__internal_getAssistantRuntime!(); return null; }
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<ConversationRuntimeProvider endpoint='http://example.test/agent' threadBinding={binding}
    unstable_agentFactory={factory} enableMessageQueue ctx={{ host: true }}
    {...(options.dynamic ? { suggestions: [{ title: 'Dynamic title', prompt: 'Dynamic question', label: 'Dynamic label' }] } : {})}>
    <AgentUIRoot theme="dark"><AgentUILocaleProvider locale='en-US'><Capture />
      <ConversationCanonicalComposer autoFocus={false} requestAdapter={options.composerAdapter} triggers={
        <AuiIf condition={state => !options.hideOnSubmit || state.thread.isEmpty === true}><Suggestions renderSlot={(_slot, fallback) => fallback} renderScopedSlot={() => null}
          {...(!options.dynamic ? { items: options.items ?? [{ title: 'Business', prompt: 'Business question', data: { id: 'Q1' } }] } : {})}
          sendOnSelect={options.send ?? true} requestAdapter={options.adapter}
          buttonProps={options.prevent ? { onClick: event => event.preventDefault() } : {}} /></AuiIf>
      } />
    </AgentUILocaleProvider></AgentUIRoot>
  </ConversationRuntimeProvider>));
  await until(() => !runtime.thread.getState().isLoading);
  return { requests, finish, runtime, host,
    async click(text = 'Business') { const button = [...host.querySelectorAll('button')].find(node => node.textContent?.includes(text))!; expect(button).toBeTruthy(); await act(async () => button.click()); },
  };
}
it('submits adapted JSON and raw selection through the final Composer adapter', async () => {
  const adapter = vi.fn<ComposerRequestAdapter>(({ request, pluginData, selections }) => ({
    ...request, forwardedProps: { custom: pluginData['standalone:suggestions'], raw: selections['standalone:suggestions'] },
  }));
  const f = await fixture({ adapter: item => ({ selected: item.data ?? null }), composerAdapter: adapter });
  await f.click(); await until(() => f.requests.length === 1 && !f.runtime.thread.getState().isRunning);
  expect(f.requests[0]!.messages[0]!.content).toBe('Business question');
  expect(f.requests[0]!.forwardedProps).toEqual({ custom: [{ selected: { id: 'Q1' } }], raw: [{ title: 'Business', prompt: 'Business question', data: { id: 'Q1' } }] });
  expect(adapter).toHaveBeenCalledOnce();
  expect(JSON.stringify(f.requests[0])).not.toContain('agentUIComposerData');
});
it('keeps the submitted selection when the empty-state Plugin unmounts', async () => {
  const f = await fixture({ hideOnSubmit: true, adapter: item => ({ question: item.prompt }) });
  await f.click(); await until(() => f.requests.length === 1);
  expect(f.requests[0]!.forwardedProps).toHaveProperty('standalone:suggestions', [{ question: 'Business question' }]);
});
it('preserves default wire text while exposing raw data to Composer', async () => {
  const adapter = vi.fn<ComposerRequestAdapter>(({ request }) => request);
  const f = await fixture({ composerAdapter: adapter });
  await f.click(); await until(() => f.requests.length === 1);
  expect(f.requests[0]!.forwardedProps).toEqual({ ctx: { host: true } });
  expect(adapter.mock.calls[0]![0].selections['standalone:suggestions']).toHaveLength(1);
});
it('handles runtime-provided suggestions with the same adapter', async () => {
  const f = await fixture({ dynamic: true, adapter: item => ({ source: item.prompt }) });
  await f.click('Dynamic title'); await until(() => f.requests.length === 1);
  expect(f.requests[0]!.forwardedProps).toHaveProperty('standalone:suggestions', [{ source: 'Dynamic question' }]);
});
it('fills the draft and excludes data after the suggested text is deleted', async () => {
  const f = await fixture({ send: false, adapter: item => ({ source: item.prompt }) });
  await f.click(); expect(f.requests).toHaveLength(0);
  expect(f.runtime.thread.composer.getState().text).toBe('Business question');
  await act(async () => { f.runtime.thread.composer.setText('Deleted'); f.runtime.thread.composer.send(); });
  await until(() => f.requests.length === 1);
  expect(f.requests[0]!.forwardedProps).toEqual({ ctx: { host: true } });
});
it('preserves prevented selections and fails locally for invalid adapter data', async () => {
  const adapter = vi.fn<ConversationSuggestionRequestAdapter>(() => ({ value: Number.NaN }));
  const f = await fixture({ adapter });
  await act(async () => f.runtime.thread.composer.setText('Keep draft'));
  await f.click(); expect(f.requests).toHaveLength(0);
  expect(f.runtime.thread.composer.getState().text).toBe('Keep draft');
  expect(f.host.querySelector('[role="alert"]')?.textContent).toContain('Unable to use');
});
it('does not capture a selection prevented by application button props', async () => {
  const adapter = vi.fn<ConversationSuggestionRequestAdapter>(item => item.prompt);
  const f = await fixture({ prevent: true, adapter });
  await f.click(); expect(adapter).not.toHaveBeenCalled(); expect(f.requests).toHaveLength(0);
});
it('keeps queued clicks independent and preserves the unsent draft', async () => {
  const f = await fixture({ hold: true, items: [{ title: 'First', prompt: 'One' }, { title: 'Second', prompt: 'Two' }], adapter: item => item.prompt });
  await f.click('First'); await until(() => f.requests.length === 1);
  await act(async () => f.runtime.thread.composer.setText('Unsent draft'));
  await f.click('Second'); expect(f.requests).toHaveLength(1);
  expect(f.runtime.thread.composer.getState().text).toBe('Unsent draft');
  await act(async () => f.finish[0]!()); await until(() => f.requests.length === 2);
  expect(f.requests[0]!.forwardedProps).toHaveProperty('standalone:suggestions', ['One']);
  expect(f.requests[1]!.forwardedProps).toHaveProperty('standalone:suggestions', ['Two']);
  expect(f.runtime.thread.composer.getState().text).toBe('Unsent draft');
  await act(async () => f.finish[1]!()); await until(() => !f.runtime.thread.getState().isRunning);
  await act(async () => f.runtime.thread.composer.send()); await until(() => f.requests.length === 3);
  expect(f.requests[2]!.forwardedProps).toEqual({ ctx: { host: true } });
  await act(async () => f.finish[2]!());
});
it('uses the same data port for native follow-up suggestions through Thread composition', async () => {
  const parts = new ConversationRequestPartsRuntime();
  let native!: AssistantRuntime;
  const adapter = vi.fn<ConversationSuggestionRequestAdapter>(item => ({ followup: item.prompt }));
  function Followups() { return <ConversationFollowupSuggestions requestAdapter={adapter} />; }
  function Host() {
    native = useLocalRuntime({ async *run() { yield { content: [{ type: 'text', text: 'Seed answer' }] }; } }, {
      adapters: { suggestion: { generate: async () => [{ title: 'Follow up', label: 'Next', prompt: 'Next question' }] } },
    });
    useLayoutEffect(() => parts.attach('native', native), []);
    return <AssistantRuntimeProvider runtime={native}><ConversationComposerDataContext.Provider value={{ runtime: parts, threadId: 'native' }}>
      <ConversationThread components={{ FollowupSuggestions: Followups }} composer={null} />
    </ConversationComposerDataContext.Provider></AssistantRuntimeProvider>;
  }
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<AgentUIRoot theme='dark'><Host /></AgentUIRoot>));
  await act(async () => { native.thread.composer.setText('Seed'); native.thread.composer.send(); });
  await until(() => host.querySelector('.aui-thread-followup-suggestion') !== null);
  const button = host.querySelector<HTMLButtonElement>('.aui-thread-followup-suggestion')!;
  expect(button).toBeTruthy();
  await act(async () => button.click());
  const user = [...native.thread.getState().messages].reverse().find(message => message.role === 'user')!;
  expect(adapter).toHaveBeenCalledWith({ prompt: 'Next question', title: 'Follow up', label: 'Next' });
  expect(parts.prepare(user).pluginData).toHaveProperty('standalone:suggestions', [{ followup: 'Next question' }]);
});

});
