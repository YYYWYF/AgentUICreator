import { expect, it } from 'vitest';
import { EventType, HttpAgent, type AgentSubscriber, type AGUIEvent, type RunAgentInput } from '@ag-ui/client';
import type { ThreadMessage } from '@assistant-ui/react';
import { ConversationMessageMetadataStore } from '../src/compatibility/conversation-message-metadata.js';

function message(id: string, custom: Record<string, unknown> = {}): Extract<ThreadMessage, { role: 'assistant' }> {
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

const identityEvents: AGUIEvent[] = [
  { type: EventType.RUN_STARTED, threadId: 'thread', runId: 'run-1' },
  { type: EventType.RUN_FINISHED, threadId: 'thread', runId: 'run-1' },
  { type: EventType.RUN_ERROR, message: 'failed' },
  { type: EventType.STEP_STARTED, stepName: 'prepare' },
  { type: EventType.STEP_FINISHED, stepName: 'prepare' },
  { type: EventType.REASONING_START, messageId: 'reasoning-block' },
  { type: EventType.REASONING_MESSAGE_START, messageId: 'reasoning', role: 'reasoning' },
  { type: EventType.REASONING_MESSAGE_CONTENT, messageId: 'reasoning', delta: 'Thinking' },
  { type: EventType.REASONING_MESSAGE_END, messageId: 'reasoning' },
  { type: EventType.REASONING_END, messageId: 'reasoning-block' },
  { type: EventType.CUSTOM, name: 'identity', value: {} },
  { type: EventType.RAW, event: {} },
  { type: EventType.STATE_SNAPSHOT, snapshot: {} },
  { type: EventType.STATE_DELTA, delta: [] },
  { type: EventType.ACTIVITY_SNAPSHOT, messageId: 'plan', activityType: 'plan', content: {} },
  { type: EventType.ACTIVITY_DELTA, messageId: 'plan', activityType: 'plan', patch: [] },
  { type: EventType.TOOL_CALL_START, toolCallId: 'tool', toolCallName: 'search' },
  { type: EventType.TOOL_CALL_ARGS, toolCallId: 'tool', delta: '{}' },
  { type: EventType.TOOL_CALL_END, toolCallId: 'tool' },
  { type: EventType.TOOL_CALL_RESULT, toolCallId: 'tool', messageId: 'result', role: 'tool', content: 'Found' },
];

it.each(identityEvents)('reads speaker on $type without copying unrelated event metadata into the assistant', async event => {
  const f = fixture(); const current = message('answer');
  const speaker = { id: 'expert', name: 'Expert' };
  await f.begin(); f.publish([current]);
  await f.event({ ...event, metadata: { speaker, trace: 'event-only' } });
  expect(f.store.read(current).speaker).toEqual(speaker);
  expect(f.store.read(current)).not.toHaveProperty('trace');
  expect(current.metadata.custom).not.toHaveProperty('speaker');
  f.store.stop();
});

it('inherits an early identity, freezes completed messages on switches and resets defaults on the next run', async () => {
  const old: ThreadMessage = { ...message('history'), status: { type: 'complete', reason: 'stop' } };
  const f = fixture([old]);
  const expert = { id: 'expert', name: 'Expert' }; const designer = { id: 'designer', name: 'Designer' };
  await f.begin();
  await f.event({ type: EventType.RUN_STARTED, threadId: 'thread', runId: 'run-1', metadata: { speaker: expert } });
  const first = message('first'); f.publish([old, first]);
  expect(f.store.read(first).speaker).toEqual(expert);
  expect(f.store.read(old)).not.toHaveProperty('speaker');
  const completed: ThreadMessage = { ...first, status: { type: 'complete', reason: 'stop' } };
  f.publish([old, completed]);
  await f.event({ type: EventType.CUSTOM, name: 'switch-expert', value: {}, metadata: { speaker: designer } });
  expect(f.store.read(completed).speaker).toEqual(expert);
  const second = message('second'); f.publish([old, completed, second]);
  expect(f.store.read(second).speaker).toEqual(designer);
  await f.event({ type: EventType.STATE_SNAPSHOT, snapshot: {}, metadata: { speaker: null } });
  expect(f.store.read(second).speaker).toBeNull();
  const third = message('third'); f.publish([old, completed, second, third]);
  expect(f.store.read(third).speaker).toBeNull();
  await f.finish();
  const finished = [old, completed, second, third].map((item): ThreadMessage => ({ ...item, status: { type: 'complete', reason: 'stop' } }));
  f.publish(finished); await f.begin('next');
  const fresh = message('fresh'); f.publish([...finished, fresh]);
  expect(f.store.read(fresh)).not.toHaveProperty('speaker');
  f.store.stop();
});

it('ignores subagent identity and stale identity events outside the current active run', async () => {
  const f = fixture(); const current = message('answer');
  await f.begin(); f.publish([current]);
  const event = { type: EventType.CUSTOM, name: 'identity', value: {}, metadata: { speaker: { id: 'wrong', name: 'Wrong' } } } as const;
  await f.event({ ...event, subagentRunId: 'child' });
  await f.event(event, 'old-run');
  expect(f.store.read(current)).not.toHaveProperty('speaker');
  f.publish([current], false); await f.event(event);
  expect(f.store.read(current)).not.toHaveProperty('speaker');
  await f.finish(); f.publish([current]); await f.event(event);
  expect(f.store.read(current)).not.toHaveProperty('speaker');
  f.store.stop();
});

it('retains inherited identity while text metadata and native streamed content change', async () => {
  const f = fixture();
  const speaker = { id: 'expert', name: 'Expert' };
  await f.begin();
  await f.event({ type: EventType.CUSTOM, name: 'identity', value: {}, metadata: { speaker } });
  await f.event({ type: EventType.TEXT_MESSAGE_START, messageId: 'answer', role: 'assistant', metadata: { trace: 'first' } });
  const current = message('answer'); f.publish([current]);
  const changed = { ...current, content: [{ type: 'text', text: 'More text' } as const] };
  f.publish([changed]);
  expect(f.store.read(changed)).toMatchObject({ speaker, trace: 'first' });
  await f.event({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'answer', delta: 'more', metadata: { trace: 'second' } });
  expect(f.store.read(changed)).toMatchObject({ speaker, trace: 'second' });
  f.store.stop();
});

it('keeps snapshot message identities authoritative and uses event-level identity only for future live messages', async () => {
  const f = fixture(); const speaker = { id: 'expert', name: 'Expert' };
  const savedSpeaker = { id: 'saved', name: 'Saved' };
  await f.begin();
  await f.event({ type: EventType.MESSAGES_SNAPSHOT,
    messages: [{ id: 'saved', role: 'assistant', content: 'History', metadata: { speaker: savedSpeaker } }],
    metadata: { speaker },
  });
  const saved = message('saved', { speaker: savedSpeaker }); f.publish([saved]);
  expect(f.store.read(saved).speaker).toEqual(savedSpeaker);
  const next = message('next'); f.publish([saved, next]);
  expect(f.store.read(next).speaker).toEqual(speaker);
  f.store.stop();
});
