// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { useAui, ThreadPrimitive, MessagePrimitive, type AssistantRuntime } from '@assistant-ui/react';
import { expect, it } from 'vitest';
import { ConversationRuntimeProvider } from '../../runtime/src/ConversationRuntimeProvider.js';
import { useConversation, type MessageSpeaker, type ConversationThreadSnapshot } from '../src/public.js';
import type { ConversationThreadBinding } from '../../runtime/src/threads/types.js';
import { projectLangChainHistory } from '../../runtime/src/history/langchain-history-projector.js';
import { AssistantMessageIdentity, type MessageIdentityOptions } from '../src/plugins/conversation-surface/adapters/presentation/message-identity.js';
import { CanonicalConversationSurfacePlugin } from '../src/plugins/conversation-surface/adapters/presentation/conversation-surface.js';
import { AssistantMessage } from '../src/plugins/conversation-surface/adapters/presentation/thread/assistant-message.js';
import { AgentUILocaleProvider } from '../src/locale.js';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const expert = { id: 'developer', name: '高级开发工程师', avatarUrl: '/experts/developer.png' };
const assistant = { id: 'assistant', name: '业务助手' };
type Run = { input: { runId: string; threadId: string }; emit(event: Record<string, unknown>): void; finish(metadata?: Record<string, unknown>): void };
async function until(predicate: () => boolean) {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error('Timed out waiting for message metadata');
}

async function fixture(options: { history?: readonly unknown[]; identity?: false | MessageIdentityOptions; defaultMessage?: boolean; runMetadata?: Record<string, unknown> } = {}) {
  let runtime!: AssistantRuntime;
  const runs: Run[] = [];
  const metadataReads = new Map<string, Readonly<Record<string, unknown>>>();
  const speakerReads = new Map<string, MessageSpeaker | null | undefined>();
  let snapshot!: ConversationThreadSnapshot;
  let selected = 'A';
  const binding: ConversationThreadBinding = {
    getThreadId: () => selected, activateThread: id => { selected = id; }, subscribe: () => () => {}, createNewThread: async () => 'new',
    loadThread: async () => ({ messages: projectLangChainHistory(options.history ?? []) }),
    getThreadListSnapshot: () => ({ threads: [{ id: 'A', status: 'regular' }, { id: 'B', status: 'regular' }], archivedThreads: [] }),
  };
  function Message() {
    const id = useAui().message.getState().id;
    const metadata = useConversation(state => state.message.metadata.custom);
    const speaker = useConversation(state => state.message.speaker);
    metadataReads.set(id, metadata);
    speakerReads.set(id, speaker);
    if (options.defaultMessage) return <AgentUILocaleProvider locale='zh-CN'><AssistantMessage /></AgentUILocaleProvider>;
    return <MessagePrimitive.Root data-message-id={id}><AssistantMessageIdentity /><MessagePrimitive.Parts /></MessagePrimitive.Root>;
  }
  function View({ children }: { children?: ReactNode }) {
    runtime = useAui().threads.__internal_getAssistantRuntime!();
    snapshot = useConversation(state => state.thread);
    return <>{children}<ThreadPrimitive.Root><ThreadPrimitive.Messages components={{ UserMessage: () => null, AssistantMessage: Message }} /></ThreadPrimitive.Root></>;
  }
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ConversationRuntimeProvider endpoint='http://example.test/agent' threadBinding={binding}
    fetch={async (_url, init) => {
      const input = JSON.parse(String(init.body)) as Run['input'];
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
      const open = new Map<string, unknown>();
      const emit = (event: Record<string, unknown>) => {
        if (typeof event.messageId === 'string') {
          if (event.type === 'TEXT_MESSAGE_START') open.set(event.messageId, event.subagentRunId);
          if (event.type === 'TEXT_MESSAGE_END') open.delete(event.messageId);
        }
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      runs.push({ input, emit, finish(metadata) {
        for (const [messageId, subagentRunId] of open) emit({ type: 'TEXT_MESSAGE_END', messageId, ...(subagentRunId === undefined ? {} : { subagentRunId }) });
        emit({ type: 'RUN_FINISHED', threadId: input.threadId, runId: input.runId,
          ...(metadata === undefined ? {} : { metadata }) }); controller.close();
      } });
      init.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
      emit({ type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId,
        ...(options.runMetadata === undefined ? {} : { metadata: options.runMetadata }) });
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
    }}>
    <CanonicalConversationSurfacePlugin {...(options.identity === undefined ? {} : { messageIdentity: options.identity })}
      Adapter={() => <View />} />
  </ConversationRuntimeProvider>));
  await until(() => !runtime.thread.getState().isLoading);
  return { host, runs, metadataReads, speakerReads, get snapshot() { return snapshot; }, get runtime() { return runtime; },
    async send() {
      const count = runs.length;
      await act(async () => runtime.thread.append('Question'));
      await until(() => runs.length > count);
      return runs[count]!;
    },
    async dispose() { await act(async () => { if (runtime.thread.getState().isRunning) runtime.thread.cancelRun(); root.unmount(); }); host.remove(); },
  };
}

async function text(run: Run, id: string, metadata?: Record<string, unknown>) {
  await act(async () => {
    run.emit({ type: 'TEXT_MESSAGE_START', messageId: id, role: 'assistant', ...(metadata ? { metadata } : {}) });
    run.emit({ type: 'TEXT_MESSAGE_CONTENT', messageId: id, delta: 'Hello' });
  });
}

it('shows the expert identity on START before any text or completion arrives', async () => {
  const f = await fixture({ defaultMessage: true });
  try {
    const run = await f.send();
    await act(async () => run.emit({ type: 'TEXT_MESSAGE_START', messageId: 'early-expert', role: 'assistant', metadata: { speaker: expert } }));
    await until(() => f.host.querySelector('[data-speaker-id="developer"]') !== null);
    expect(f.runtime.thread.getState().isRunning).toBe(true);
    expect(f.host.querySelector('img')?.getAttribute('src')).toBe(expert.avatarUrl);
    expect(f.host.querySelector('[data-slot="aui_assistant-message-content"]')?.textContent).not.toContain('Hello');
    await act(async () => {
      run.emit({ type: 'REASONING_START', messageId: 'reasoning-block' });
      run.emit({ type: 'REASONING_MESSAGE_START', messageId: 'reasoning-text', role: 'reasoning' });
      run.emit({ type: 'REASONING_MESSAGE_CONTENT', messageId: 'reasoning-text', delta: 'Inspecting the question' });
    });
    await until(() => f.host.textContent?.includes('Inspecting the question') === true);
    expect(f.host.querySelector('[data-speaker-id="developer"]')).not.toBeNull();
    expect(f.host.querySelector('img')?.getAttribute('src')).toBe(expert.avatarUrl);
    expect(f.runtime.thread.getState().isRunning).toBe(true);
    expect(f.host.querySelector('[data-slot="aui_assistant-message-content"]')?.textContent).not.toContain('Hello');
    await act(async () => {
      run.emit({ type: 'REASONING_MESSAGE_END', messageId: 'reasoning-text' });
      run.emit({ type: 'REASONING_END', messageId: 'reasoning-block' });
    });
    await act(async () => run.emit({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'early-expert', delta: 'Hello' }));
    await until(() => f.host.querySelector('[data-slot="aui_assistant-message-content"]')?.textContent?.includes('Hello') === true);
    expect(f.host.querySelector('[data-speaker-id="developer"]')).not.toBeNull();
    expect(f.runtime.thread.getState().isRunning).toBe(true);
  } finally { await f.dispose(); }
});

it.each(['run', 'reasoning', 'custom'] as const)('shows identity from %s before TEXT begins, inherits it and preserves previous speakers', async source => {
  const f = await fixture({ defaultMessage: true, ...(source === 'run' ? { runMetadata: { speaker: expert } } : {}) });
  try {
    const run = await f.send();
    if (source === 'custom') await act(async () => run.emit({ type: 'CUSTOM', name: 'speaker-changed', value: {}, metadata: { speaker: expert } }));
    if (source !== 'reasoning') await until(() => f.host.querySelector('[data-speaker-id="developer"]') !== null);
    await act(async () => {
      run.emit({ type: 'REASONING_START', messageId: 'reasoning-block', ...(source === 'reasoning' ? { metadata: { speaker: expert } } : {}) });
      run.emit({ type: 'REASONING_MESSAGE_START', messageId: 'reasoning-text', role: 'reasoning' });
      run.emit({ type: 'REASONING_MESSAGE_CONTENT', messageId: 'reasoning-text', delta: 'Expert is thinking' });
    });
    await until(() => f.host.textContent?.includes('Expert is thinking') === true && f.host.querySelector('[data-speaker-id="developer"]') !== null);
    expect(f.host.querySelector('img')?.getAttribute('src')).toBe(expert.avatarUrl);
    expect(f.host.querySelector('[data-slot="aui_assistant-message-content"]')?.textContent).not.toContain('Hello');
    expect(f.runtime.thread.getState().isRunning).toBe(true);
    await act(async () => {
      run.emit({ type: 'REASONING_MESSAGE_END', messageId: 'reasoning-text' });
      run.emit({ type: 'REASONING_END', messageId: 'reasoning-block' });
    });
    await text(run, 'answer');
    await until(() => f.speakerReads.get('answer')?.id === expert.id);
    await act(async () => run.emit({ type: 'TEXT_MESSAGE_END', messageId: 'answer' }));
    await act(async () => run.emit({ type: 'CUSTOM', name: 'switch-speaker', value: {}, metadata: { speaker: assistant } }));
    await text(run, 'second-answer');
    await until(() => f.speakerReads.get('second-answer')?.id === assistant.id);
    expect(f.speakerReads.get('answer')).toEqual(expert);
    await act(async () => run.finish());
    await until(() => !f.runtime.thread.getState().isRunning);
    expect(f.snapshot.messages.find(message => message.id === 'answer')?.speaker).toEqual(expert);
    expect(f.snapshot.messages.find(message => message.id === 'second-answer')?.speaker).toEqual(assistant);
  } finally { await f.dispose(); }
});

it('labels an otherwise unlabelled response when identity arrives only on RUN_FINISHED', async () => {
  const f = await fixture();
  try {
    const run = await f.send();
    await text(run, 'late-identity');
    await until(() => f.host.querySelector('[data-message-id="late-identity"]') !== null);
    expect(f.host.querySelector('[data-speaker-id="developer"]')).toBeNull();
    await act(async () => run.finish({ speaker: expert }));
    await until(() => !f.runtime.thread.getState().isRunning && f.host.querySelector('[data-speaker-id="developer"]') !== null);
    expect(f.snapshot.messages.find(message => message.id === 'late-identity')?.speaker).toEqual(expert);
  } finally { await f.dispose(); }
});

it('keeps each expert answer with its preceding reasoning when both reasoning sequences arrive before TEXT', async () => {
  const f = await fixture({ defaultMessage: true });
  try {
    const run = await f.send();
    for (const [id, speaker, reasoning] of [
      ['expert-one', expert, 'First expert reasoning'],
      ['expert-two', assistant, 'Second expert reasoning'],
    ] as const) {
      await act(async () => {
        run.emit({ type: 'CUSTOM', name: 'speaker-selected', value: {}, metadata: { speaker } });
        run.emit({ type: 'REASONING_START', messageId: `${id}-block` });
        run.emit({ type: 'REASONING_MESSAGE_START', messageId: `${id}-thought`, role: 'reasoning' });
        run.emit({ type: 'REASONING_MESSAGE_CONTENT', messageId: `${id}-thought`, delta: reasoning });
        run.emit({ type: 'REASONING_MESSAGE_END', messageId: `${id}-thought` });
        run.emit({ type: 'REASONING_END', messageId: `${id}-block` });
      });
      await text(run, id);
      await until(() => f.speakerReads.get(id)?.id === speaker.id);
      await act(async () => run.emit({ type: 'TEXT_MESSAGE_END', messageId: id }));
    }
    await act(async () => run.finish());
    await until(() => !f.runtime.thread.getState().isRunning);
    const first = f.host.querySelector('[data-message-id="expert-one"]');
    const second = f.host.querySelector('[data-message-id="expert-two"]');
    // Completed reasoning is collapsed in the default UI; inspect its canonical owner.
    const reasoningFor = (id: string) => f.runtime.thread.getState().messages.find(message => message.id === id)
      ?.content.flatMap(part => part.type === 'reasoning' ? [part.text] : []).join('');
    expect(reasoningFor('expert-one')).toBe('First expert reasoning');
    expect(reasoningFor('expert-two')).toBe('Second expert reasoning');
    expect(first?.querySelector('[data-speaker-id="developer"]')).not.toBeNull();
    expect(second?.querySelector('[data-speaker-id="assistant"]')).not.toBeNull();
  } finally { await f.dispose(); }
});

it('reads START/CONTENT/END metadata live without changing native metadata or runtime identity', async () => {
  const f = await fixture();
  try {
    const native = f.runtime;
    const run = await f.send();
    await text(run, 'answer-1', { speaker: expert, trace: 'first', nested: { first: true } });
    await until(() => f.host.textContent?.includes(expert.name) === true);
    expect(f.host.querySelector('img')?.getAttribute('src')).toBe(expert.avatarUrl);
    expect(f.runtime).toBe(native);
    expect(f.runtime.thread.getState().messages.find(message => message.id === 'answer-1')?.metadata.custom.speaker).toBeUndefined();
    expect(f.runtime.thread.getState().messages.find(message => message.id === 'answer-1')).not.toHaveProperty('speaker');
    expect(f.speakerReads.get('answer-1')).toEqual(expert);
    expect(f.snapshot.messages.find(message => message.id === 'answer-1')?.speaker).toEqual(expert);
    await act(async () => run.emit({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'answer-1', delta: ' again', metadata: { trace: 'second', nested: { second: true } } }));
    await until(() => f.metadataReads.get('answer-1')?.trace === 'second');
    expect(f.metadataReads.get('answer-1')).toMatchObject({ speaker: expert, nested: { second: true } });
    expect(f.metadataReads.get('answer-1')?.nested).not.toHaveProperty('first');
    await act(async () => run.emit({ type: 'TEXT_MESSAGE_END', messageId: 'answer-1', metadata: { trace: 'finished' } }));
    await until(() => f.metadataReads.get('answer-1')?.trace === 'finished');
    await act(async () => run.finish());
    await until(() => !f.runtime.thread.getState().isRunning);
    expect(f.host.textContent).toContain(expert.name);
    await act(async () => f.host.querySelector('img')?.dispatchEvent(new Event('error')));
    expect(f.host.querySelector('img')).toBeNull();
    expect(f.host.querySelector('[data-slot="assistant-message-avatar"] svg')).not.toBeNull();
  } finally { await f.dispose(); }
});

it('keeps each reply identity, ignores subagent metadata and leaves unlabelled messages unlabelled', async () => {
  const f = await fixture();
  try {
    const first = await f.send();
    await text(first, 'expert-answer', { speaker: expert });
    await until(() => f.host.textContent?.includes(expert.name) === true);
    await act(async () => first.finish());
    await until(() => !f.runtime.thread.getState().isRunning);
    const next = await f.send();
    await text(next, 'default-answer', { speaker: assistant });
    await until(() => f.host.textContent?.includes(assistant.name) === true);
    await act(async () => next.emit({ type: 'TEXT_MESSAGE_START', messageId: 'nested-answer', role: 'assistant', subagentRunId: 'child', metadata: { speaker: { id: 'child', name: 'Child' } } }));
    expect(f.host.querySelector('[data-message-id="expert-answer"]')?.textContent).toContain(expert.name);
    expect(f.host.querySelector('[data-message-id="default-answer"]')?.textContent).toContain(assistant.name);
    await act(async () => next.finish());
    await until(() => !f.runtime.thread.getState().isRunning);
    const third = await f.send();
    await text(third, 'unlabelled');
    await until(() => f.host.querySelector('[data-message-id="unlabelled"]') !== null);
    expect(f.host.querySelector('[data-message-id="unlabelled"] [data-slot="assistant-message-identity"]')).toBeNull();
  } finally { await f.dispose(); }
});

it('restores identities from the current LangChain history contract without sending a request', async () => {
  const f = await fixture({ history: [
    { type: 'human', id: 'user-1', content: 'Question' },
    { type: 'ai', id: 'old-answer', content: 'Historical reply', additional_kwargs: { metadata: { speaker: expert } } },
  ] });
  try {
    await until(() => f.host.textContent?.includes(expert.name) === true);
    expect(f.runs).toHaveLength(0);
    expect(f.metadataReads.get('old-answer')?.speaker).toEqual(expert);
    expect(f.speakerReads.get('old-answer')).toEqual(expert);
    expect(f.snapshot.messages.find(message => message.id === 'old-answer')?.speaker).toEqual(expert);
  } finally { await f.dispose(); }
});

it('displays the identity in the maintained default assistant message component', async () => {
  const f = await fixture({ defaultMessage: true });
  try {
    const run = await f.send(); await text(run, 'default-renderer', { speaker: expert });
    await until(() => f.host.querySelector('[data-slot="aui_assistant-message-root"] [data-speaker-id="developer"]') !== null);
    expect(f.host.querySelector('[data-slot="aui_assistant-message-content"]')?.textContent).toContain('Hello');
  } finally { await f.dispose(); }
});

it('groups consecutive speaker headers, including explicit resets to the same fallback', async () => {
  const f = await fixture({ identity: { fallback: assistant } });
  try {
    const run = await f.send(); await text(run, 'segment-1', { speaker: expert });
    await until(() => f.host.querySelector('[data-message-id="segment-1"]') !== null);
    await act(async () => run.emit({ type: 'TEXT_MESSAGE_END', messageId: 'segment-1' }));
    await text(run, 'segment-2', { speaker: expert });
    await until(() => f.host.querySelector('[data-message-id="segment-2"]') !== null);
    expect(f.host.querySelectorAll('[data-slot="assistant-message-identity"]')).toHaveLength(1);
    await act(async () => run.emit({ type: 'TEXT_MESSAGE_END', messageId: 'segment-2' }));
    await text(run, 'segment-3', { speaker: assistant });
    await until(() => f.host.querySelector('[data-message-id="segment-3"] [data-speaker-id="assistant"]') !== null);
    expect(f.host.querySelectorAll('[data-slot="assistant-message-identity"]')).toHaveLength(2);
    await act(async () => run.emit({ type: 'TEXT_MESSAGE_END', messageId: 'segment-3' }));
    await text(run, 'reset-default', { speaker: null });
    await until(() => f.host.querySelector('[data-message-id="reset-default"]') !== null);
    expect(f.speakerReads.get('reset-default')).toBeNull();
    expect(f.host.querySelector('[data-message-id="reset-default"] [data-slot="assistant-message-identity"]')).toBeNull();
    expect(f.host.querySelectorAll('[data-slot="assistant-message-identity"]')).toHaveLength(2);
  } finally { await f.dispose(); }
});

it.each(['CUSTOM', 'TEXT_MESSAGE_START'] as const)('switches from expert to the configured fallback on null from %s and inherits the reset', async eventType => {
  const fallback = { ...assistant, avatarUrl: '/defaults/assistant.png' };
  const f = await fixture({ identity: { fallback } });
  try {
    const run = await f.send();
    await text(run, 'expert-reply', { speaker: expert });
    await until(() => f.host.querySelector('[data-speaker-id="developer"]') !== null);
    await act(async () => run.emit({ type: 'TEXT_MESSAGE_END', messageId: 'expert-reply' }));
    if (eventType === 'CUSTOM') await act(async () => run.emit({ type: 'CUSTOM', name: 'speaker-selected', value: {}, metadata: { speaker: null } }));
    await text(run, 'default-reply', eventType === 'TEXT_MESSAGE_START' ? { speaker: null } : undefined);
    await until(() => f.host.querySelector('[data-message-id="default-reply"] [data-speaker-id="assistant"]') !== null);
    expect(f.host.querySelector('[data-message-id="default-reply"] img')?.getAttribute('src')).toBe(fallback.avatarUrl);
    expect(f.speakerReads.get('default-reply')).toBeNull();
    expect(f.speakerReads.get('expert-reply')).toEqual(expert);
    await act(async () => run.emit({ type: 'TEXT_MESSAGE_END', messageId: 'default-reply' }));
    await text(run, 'still-default');
    await until(() => f.host.querySelector('[data-message-id="still-default"]') !== null);
    expect(f.speakerReads.get('still-default')).toBeNull();
    expect(f.host.querySelector('[data-message-id="still-default"] [data-slot="assistant-message-identity"]')).toBeNull();
    expect(f.host.querySelectorAll('[data-slot="assistant-message-identity"]')).toHaveLength(2);
    await act(async () => run.finish());
    await until(() => !f.runtime.thread.getState().isRunning);
    expect(f.snapshot.messages.find(message => message.id === 'default-reply')?.speaker).toBeNull();
  } finally { await f.dispose(); }
});

it.each([true, false])('restores a saved null speaker using the configured fallback when present (%s)', async configured => {
  const f = await fixture({
    ...(configured ? { identity: { fallback: assistant } } : {}),
    history: [{ type: 'ai', id: 'saved-default', content: 'Saved reply', additional_kwargs: { metadata: { speaker: null } } }],
  });
  try {
    await until(() => f.host.querySelector('[data-message-id="saved-default"]') !== null);
    expect(f.speakerReads.get('saved-default')).toBeNull();
    expect(f.host.querySelector('[data-speaker-id="assistant"]') !== null).toBe(configured);
  } finally { await f.dispose(); }
});

it('adopts snapshot metadata and keeps it when later live metadata updates a different key', async () => {
  const f = await fixture();
  try {
    const run = await f.send(); await text(run, 'snapshot-answer', { speaker: expert });
    await until(() => f.host.textContent?.includes(expert.name) === true);
    const user = f.runtime.thread.getState().messages.find(message => message.role === 'user')!;
    await act(async () => run.emit({ type: 'MESSAGES_SNAPSHOT', messages: [
      { id: user.id, role: 'user', content: 'Question' },
      { id: 'snapshot-answer', role: 'assistant', content: 'Hello', metadata: { speaker: assistant } },
    ] }));
    await until(() => f.host.textContent?.includes(assistant.name) === true);
    expect(f.host.textContent).not.toContain(expert.name);
    expect(f.speakerReads.get('snapshot-answer')).toEqual(assistant);
    expect(f.snapshot.messages.find(message => message.id === 'snapshot-answer')?.speaker).toEqual(assistant);
    await act(async () => run.emit({ type: 'TEXT_MESSAGE_END', messageId: 'snapshot-answer', metadata: { trace: 'after-snapshot' } }));
    await until(() => f.metadataReads.get('snapshot-answer')?.trace === 'after-snapshot');
    expect(f.metadataReads.get('snapshot-answer')?.speaker).toEqual(assistant);
  } finally { await f.dispose(); }
});

it('preserves cancelled reply identity and does not inherit it into the next reply', async () => {
  const f = await fixture();
  try {
    const native = f.runtime;
    const run = await f.send(); await text(run, 'cancelled-answer', { speaker: expert });
    await until(() => f.host.textContent?.includes(expert.name) === true);
    await act(async () => f.runtime.thread.cancelRun());
    await until(() => !f.runtime.thread.getState().isRunning);
    const next = await f.send(); await text(next, 'after-cancel');
    await until(() => f.host.querySelector('[data-message-id="after-cancel"]') !== null);
    expect(f.host.querySelector('[data-message-id="cancelled-answer"]')?.textContent).toContain(expert.name);
    expect(f.host.querySelector('[data-message-id="after-cancel"] [data-slot="assistant-message-identity"]')).toBeNull();
    expect(f.runtime).toBe(native);
    expect(f.runs).toHaveLength(2);
  } finally { await f.dispose(); }
});

it('preserves original and regenerated identities when switching native branches', async () => {
  const f = await fixture();
  try {
    const run = await f.send(); await text(run, 'original', { speaker: expert });
    await until(() => f.host.textContent?.includes(expert.name) === true);
    await act(async () => run.finish()); await until(() => !f.runtime.thread.getState().isRunning);
    await act(async () => f.runtime.thread.getMessageById('original').reload());
    await until(() => f.runs.length === 2);
    await text(f.runs[1]!, 'regenerated', { speaker: assistant });
    await until(() => f.host.textContent?.includes(assistant.name) === true);
    await act(async () => f.runs[1]!.finish()); await until(() => !f.runtime.thread.getState().isRunning);
    await act(async () => f.runtime.thread.getMessageById('regenerated').switchToBranch({ position: 'previous' }));
    await until(() => f.host.textContent?.includes(expert.name) === true);
    expect(f.host.textContent).not.toContain(assistant.name);
    expect(f.speakerReads.get('original')).toEqual(expert);
    expect(f.snapshot.messages.find(message => message.id === 'original')?.speaker).toEqual(expert);
  } finally { await f.dispose(); }
});

it('keeps Thread metadata isolated when the backend reuses a message id in a different Thread', async () => {
  const f = await fixture();
  try {
    const first = await f.send(); await text(first, 'same-id', { speaker: expert });
    await until(() => f.host.textContent?.includes(expert.name) === true);
    await act(async () => first.finish()); await until(() => !f.runtime.thread.getState().isRunning);
    await act(async () => { await f.runtime.threads.switchToThread('B'); });
    await until(() => !f.runtime.thread.getState().isLoading);
    const second = await f.send(); await text(second, 'same-id', { speaker: assistant });
    await until(() => f.host.textContent?.includes(assistant.name) === true);
    expect(f.host.textContent).not.toContain(expert.name);
    expect(f.speakerReads.get('same-id')).toEqual(assistant);
    expect(f.snapshot.messages.find(message => message.id === 'same-id')?.speaker).toEqual(assistant);
    await act(async () => second.finish()); await until(() => !f.runtime.thread.getState().isRunning);
    await act(async () => { await f.runtime.threads.switchToThread('A'); });
    await until(() => f.host.textContent?.includes(expert.name) === true);
    expect(f.host.textContent).not.toContain(assistant.name);
    expect(f.speakerReads.get('same-id')).toEqual(expert);
    expect(f.snapshot.messages.find(message => message.id === 'same-id')?.speaker).toEqual(expert);
  } finally { await f.dispose(); }
});

it('isolates concurrently mounted Agent instances even when their message ids match', async () => {
  const first = await fixture(); const second = await fixture();
  try {
    const a = await first.send(); const b = await second.send();
    await text(a, 'shared-id', { speaker: expert });
    await text(b, 'shared-id', { speaker: assistant });
    await until(() => first.host.textContent?.includes(expert.name) === true && second.host.textContent?.includes(assistant.name) === true);
    expect(first.host.textContent).not.toContain(assistant.name);
    expect(second.host.textContent).not.toContain(expert.name);
    expect(first.runtime).not.toBe(second.runtime);
    expect(first.speakerReads.get('shared-id')).toEqual(expert);
    expect(second.speakerReads.get('shared-id')).toEqual(assistant);
    expect(first.runs).toHaveLength(1); expect(second.runs).toHaveLength(1);
  } finally { await first.dispose(); await second.dispose(); }
});

const configurations: Array<false | MessageIdentityOptions> = [false, { fallback: assistant }, { render: ({ speaker }) => <b data-custom-speaker=''>{speaker.name}</b> }];
it.each(configurations)('forwards identity presentation configuration through the application component (%j)', async identity => {
  const f = await fixture({ identity });
  try {
    const run = await f.send(); await text(run, 'configured', identity === false ? { speaker: expert } : identity && 'fallback' in identity ? undefined : { speaker: expert });
    await until(() => f.host.querySelector('[data-message-id="configured"]') !== null);
    if (identity === false) {
      expect(f.host.querySelector('[data-slot="assistant-message-identity"]')).toBeNull();
      expect(f.speakerReads.get('configured')).toEqual(expert);
    } else if ('fallback' in identity) {
      expect(f.host.textContent).toContain(assistant.name);
      expect(f.speakerReads.get('configured')).toBeUndefined();
      expect(f.snapshot.messages.find(message => message.id === 'configured')?.speaker).toBeUndefined();
    }
    else expect(f.host.querySelector('[data-custom-speaker]')?.textContent).toBe(expert.name);
  } finally { await f.dispose(); }
});
