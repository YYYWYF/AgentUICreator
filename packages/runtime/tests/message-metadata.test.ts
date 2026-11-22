import { expect, it } from 'vitest';
import { EventType, HttpAgent, type AgentSubscriber, type AGUIEvent, type RunAgentInput } from '@ag-ui/client';
import type { ThreadMessage } from '@assistant-ui/react';
import { ConversationMessageMetadataStore } from '../src/compatibility/conversation-message-metadata.js';

function message(id: string, custom: Record<string, unknown> = {}): ThreadMessage {
  return { id, role: 'assistant', createdAt: new Date(), content: [{ type: 'text', text: 'Answer' }],
    status: { type: 'running' }, metadata: { custom, unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [] } };
}

function fixture(initial: ThreadMessage[] = []) {
  let observer: AgentSubscriber = {};
  let state = { messages: initial, isRunning: true };
  const listeners = new Set<() => void>();
  let stopped = false;
  const store = new ConversationMessageMetadataStore({ subscribe(value) { observer = value; return { unsubscribe() { stopped = true; } }; } }, {
    getState: () => state, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  });
  let input: RunAgentInput = { threadId: 'thread', runId: 'run-1', state: {}, messages: [], tools: [], context: [], forwardedProps: {} };
  const agent = new HttpAgent({ url: 'http://fixture.test' });
  const params = () => ({ input, agent, messages: [], state: {} });
  store.start();
  return { store, get stopped() { return stopped; },
    async begin(id = 'run-1') { input = { ...input, runId: id }; await observer.onRunInitialized?.(params()); },
    async event(event: AGUIEvent, runId = input.runId) { await observer.onEvent?.({ ...params(), input: { ...input, runId }, event }); },
    async finish() { await observer.onRunFinalized?.(params()); },
    publish(messages: ThreadMessage[], isRunning = true) { state = { messages, isRunning }; for (const listener of listeners) listener(); },
  };
}

it('binds pending metadata to the native message via its server id alias and exposes stable snapshots', async () => {
  const f = fixture(); const current = message('local-id', { agui: { messageId: 'wire-id' }, historyKey: 'kept' });
  await f.begin();
  await f.event({ type: EventType.TEXT_MESSAGE_START, role: 'assistant', messageId: 'wire-id', metadata: { speaker: { id: 'one', name: 'Expert' } } });
  f.publish([current]);
  expect(f.store.read(current)).toMatchObject({ speaker: { id: 'one' }, historyKey: 'kept' });
  expect(f.store.read(current)).toBe(f.store.read(current));
  // A nested message with a colliding id must never read the root supplement.
  const nested = { ...current, metadata: { ...current.metadata, custom: { own: 'nested' } } };
  expect(f.store.read(nested)).toEqual({ own: 'nested' });
  f.store.stop(); expect(f.stopped).toBe(true);
});

it('ignores old-run, finalized, cancelled and subagent events', async () => {
  const f = fixture(); const current = message('a');
  await f.begin(); f.publish([current]);
  await f.event({ type: EventType.TEXT_MESSAGE_START, role: 'assistant', messageId: 'a', metadata: { speaker: 'original' } });
  const update = { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'a', delta: 'text', metadata: { speaker: 'wrong' } } as const;
  await f.event(update, 'older-run');
  await f.event({ ...update, subagentRunId: 'child' });
  expect(f.store.read(current).speaker).toBe('original');
  f.publish([current], false); await f.event(update);
  expect(f.store.read(current).speaker).toBe('original');
  await f.finish(); f.publish([current]); await f.event(update);
  expect(f.store.read(current).speaker).toBe('original');
  f.store.stop();
});

it('rejects reused terminal message ids, retains branch metadata and does not bind old supplements to restored records', async () => {
  const f = fixture(); const first = message('a');
  await f.begin(); f.publish([first]);
  await f.event({ type: EventType.TEXT_MESSAGE_START, role: 'assistant', messageId: 'a', metadata: { speaker: 'original' } });
  const completed: ThreadMessage = { ...first, status: { type: 'complete', reason: 'stop' } };
  f.publish([completed]); await f.finish(); await f.begin('next');
  await f.event({ type: EventType.TEXT_MESSAGE_START, role: 'assistant', messageId: 'a', metadata: { speaker: 'wrong' } });
  expect(f.store.read(completed).speaker).toBe('original');
  f.publish([]); f.publish([completed]); expect(f.store.read(completed).speaker).toBe('original');
  const restored = message('a', { speaker: 'persisted' }); f.publish([restored]);
  expect(f.store.read(restored).speaker).toBe('persisted');
  f.store.stop();
});

it('carries supplemental keys through a legitimate tool continuation and replaces nested values shallowly', async () => {
  const f = fixture(); const current = message('a');
  await f.begin(); f.publish([current]);
  await f.event({ type: EventType.TEXT_MESSAGE_START, role: 'assistant', messageId: 'a', metadata: { speaker: { id: 'one', name: 'Expert' }, nested: { first: true } } });
  await f.finish();
  const waiting: ThreadMessage = { ...current, status: { type: 'requires-action', reason: 'tool-calls' } };
  f.publish([waiting]); await f.begin('tool-continuation');
  await f.event({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'a', delta: 'continued', metadata: { nested: { second: true } } });
  expect(f.store.read(waiting)).toMatchObject({ speaker: { id: 'one' }, nested: { second: true } });
  expect(f.store.read(waiting).nested).not.toHaveProperty('first');
  f.store.stop();
});
