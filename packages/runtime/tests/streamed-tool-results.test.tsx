import { MessagePrimitive, ThreadPrimitive, useAui, type AssistantRuntime, type ThreadMessage, type ToolCallMessagePart } from '@assistant-ui/react';
import { ConversationToolResult, useConversation, type ConversationThreadController } from '@za38.03/agent-ui-plugins';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { ConversationRuntimeProvider } from '../src/ConversationRuntimeProvider.js';
import { createEphemeralConversationThreadBinding } from '../src/threads/ephemeral-thread-binding.js';
import type { ConversationToolCallProps } from '../src/plugin-api/conversation.js';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error('Streamed tool result did not arrive');
}

async function fixture(named = false) {
  let runtime!: AssistantRuntime;
  let conversation!: ConversationThreadController;
  let tree!: ReactTestRenderer;
  const requests: Array<{ threadId: string; runId: string; stream: ReadableStreamDefaultController<Uint8Array> }> = [];
  function Tool(props: ConversationToolCallProps) {
    return <div data-tool={props.toolCallId} data-status={props.status.type} data-preliminary={props.isPreliminary === true}>
      <ConversationToolResult {...props} expanded />
    </div>;
  }
  function AssistantMessage() {
    return <MessagePrimitive.Root>
      <MessagePrimitive.Parts components={{ tools: { Fallback: Tool } }} />
    </MessagePrimitive.Root>;
  }
  function Capture() {
    runtime = useAui().threads.__internal_getAssistantRuntime!();
    conversation = useConversation();
    const messages = useConversation(state => state.thread.messages);
    return <>
      <output data-live-results>{JSON.stringify(messages.flatMap(message => message.content)
        .filter(part => part.type === 'tool-call').map(part => part.result))}</output>
      <ThreadPrimitive.Messages components={{ AssistantMessage, UserMessage: () => null }} />
    </>;
  }
  await act(async () => {
    tree = create(<ConversationRuntimeProvider endpoint='https://example.test/agent'
      threadBinding={createEphemeralConversationThreadBinding()}
      {...(named ? { toolkit: { analyze: { type: 'backend' as const, render: Tool } } } : {})}
      fetch={async (_url, init) => {
          const input = JSON.parse(String(init.body)) as { threadId: string; runId: string };
          const body = new ReadableStream<Uint8Array>({ start(stream) {
            requests.push({ ...input, stream });
            init.signal?.addEventListener('abort', () => stream.error(new DOMException('Cancelled', 'AbortError')), { once: true });
          } });
          return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
      }}><Capture /></ConversationRuntimeProvider>);
  });
  await until(() => runtime !== undefined && !runtime.thread.getState().isLoading);
  const push = async (...events: object[]) => {
    await act(async () => {
      const stream = requests.at(-1)!.stream;
      for (const event of events) stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\r\n\r\n`));
    });
  };
  const begin = async () => {
    const count = requests.length;
    await act(async () => { runtime.thread.append('Analyze'); });
    await until(() => requests.length > count);
    const input = requests.at(-1)!;
    await push({ type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId });
  };
  const finish = async () => {
    const input = requests.at(-1)!;
    await push({ type: 'RUN_FINISHED', threadId: input.threadId, runId: input.runId });
    await act(async () => { input.stream.close(); });
    await until(() => !runtime.thread.getState().isRunning);
  };
  const result = (id: string): unknown => conversation.getSnapshot().messages
    .flatMap(message => message.content).find(part => part.type === 'tool-call' && part.toolCallId === id)?.result;
  const shown = (text: string) => tree.root.findAllByProps({ 'data-slot': 'tool-fallback-result' })
    .some(node => node.findAllByType('pre').some(pre => pre.props.children === text));
  return { runtime, conversation, tree, requests, push, begin, finish, result, shown,
    close: async () => { await act(async () => { tree.unmount(); }); },
  };
}

const start = (id: string) => [
  { type: 'TOOL_CALL_START', toolCallId: id, toolCallName: 'analyze' },
  { type: 'TOOL_CALL_ARGS', toolCallId: id, delta: '{}' },
  { type: 'TOOL_CALL_END', toolCallId: id },
];
const chunk = (id: string, content: unknown) => ({ type: 'CUSTOM', name: 'TOOL_CALL_STREAM_RESULT', value: { toolCallId: id, content } });
const final = (id: string, content: unknown) => ({ type: 'TOOL_CALL_RESULT', toolCallId: id, messageId: `${id}-result`, content, role: 'tool' });

describe('TOOL_CALL_STREAM_RESULT over the installed AG-UI runtime', () => {
  it.each([false, true])('renders chunks before completion and replaces them with the canonical result (named=%s)', async named => {
    const f = await fixture(named);
    try {
      await f.begin();
      await f.push(...start('a'), chunk('a', '第一行\n'));
      await until(() => f.shown('第一行\n'));
      expect(f.result('a')).toBe('第一行\n');
      expect(f.tree.root.findByProps({ 'data-live-results': true }).props.children).toBe(JSON.stringify(['第一行\n']));
      expect(f.runtime.thread.getState().isRunning).toBe(true);
      const native = f.runtime.thread.getState().messages.flatMap(message => message.role === 'assistant' ? message.content : [])
        .find(part => part.type === 'tool-call' && part.toolCallId === 'a');
      expect(native).not.toHaveProperty('result');
      await f.push(chunk('a', 'second line'));
      await until(() => f.shown('第一行\nsecond line'));
      expect(f.conversation.getSnapshot()).toBe(f.conversation.getSnapshot());
      if (named) expect(f.tree.root.findByProps({ 'data-tool': 'a' }).props).toMatchObject({ 'data-status': 'running', 'data-preliminary': true });
      await f.push(final('a', '完整结果'));
      await until(() => f.shown('完整结果') && f.result('a') === '完整结果');
      await f.push(chunk('a', 'late chunk'));
      expect(f.result('a')).toBe('完整结果');
      await f.finish();
      expect(f.tree.root.findByProps({ 'data-tool': 'a' }).props['data-status']).toBe('complete');
      expect(f.requests).toHaveLength(1);
    } finally { await f.close(); }
  });

  it('keeps interleaved tools separate and accepts empty and multimodal final results', async () => {
    const f = await fixture();
    try {
      await f.begin();
      await f.push(...start('a'), ...start('b'), chunk('a', 'A1'), chunk('b', 'B1'), chunk('a', 'A2'));
      await until(() => f.shown('A1A2') && f.shown('B1'));
      await f.push(final('a', ''), final('b', [{ type: 'text', text: 'Final B' }]));
      await until(() => f.result('a') === '' && Array.isArray(f.result('b')));
      expect(f.result('b')).toEqual([{ type: 'text', text: 'Final B' }]);
      await f.finish();
      expect(f.conversation.getSnapshot().messages.flatMap(message => message.content)
        .filter(part => part.type === 'tool-call')).toHaveLength(2);
    } finally { await f.close(); }
  });

  it('ignores malformed chunks, unstarted tools and mismatched subagent attribution', async () => {
    const f = await fixture();
    try {
      await f.begin();
      await f.push(...start('a'), chunk('missing', 'orphan'), chunk('a', { text: 'invalid' }),
        { ...chunk('a', 'wrong scope'), subagentRunId: 'child' }, chunk('a', 'valid'));
      await until(() => f.shown('valid'));
      expect(f.result('a')).toBe('valid');
      await f.push(final('a', 'done'));
      await f.finish();
    } finally { await f.close(); }
  });

  it('retains partial output on cancellation without leaking it into the next run', async () => {
    const f = await fixture(true);
    try {
      await f.begin();
      await f.push(...start('a'), chunk('a', 'partial'));
      await until(() => f.shown('partial'));
      await act(async () => { f.runtime.thread.cancelRun(); });
      await until(() => !f.runtime.thread.getState().isRunning);
      expect(f.result('a')).toBe('partial');
      expect(f.tree.root.findByProps({ 'data-tool': 'a' }).props['data-status']).toBe('incomplete');
      await f.begin();
      await f.push(chunk('a', 'stale'), ...start('b'), chunk('b', 'new output'));
      await until(() => f.shown('new output'));
      expect(f.result('a')).toBe('partial');
      expect(f.result('b')).toBe('new output');
      await f.push(final('b', 'done'));
      await f.finish();
    } finally { await f.close(); }
  });

  it('isolates simultaneous agents even when their tool call ids match', async () => {
    const a = await fixture(true);
    const b = await fixture(true);
    try {
      await a.begin(); await b.begin();
      await a.push(...start('same'), chunk('same', 'Agent A'));
      await b.push(...start('same'), chunk('same', 'Agent B'));
      await until(() => a.shown('Agent A') && b.shown('Agent B'));
      expect(a.result('same')).toBe('Agent A');
      expect(b.result('same')).toBe('Agent B');
      await a.push(final('same', 'A done')); await a.finish();
      expect(b.result('same')).toBe('Agent B');
      await b.push(final('same', 'B done')); await b.finish();
    } finally { await a.close(); await b.close(); }
  });

  it('updates nested subagent tool output without replacing its parent tool', async () => {
    const f = await fixture();
    const nestedResult = () => {
      const parent = f.conversation.getSnapshot().messages.flatMap(message => message.content)
        .find(part => part.type === 'tool-call' && part.toolCallId === 'parent');
      const messages = parent?.messages as readonly ThreadMessage[] | undefined;
      return messages?.flatMap(message => message.role === 'assistant' ? message.content : [])
        .find((part): part is ToolCallMessagePart => part.type === 'tool-call' && part.toolCallId === 'child-tool');
    };
    try {
      await f.begin();
      await f.push(...start('parent'),
        { type: 'SUBAGENT_STARTED', subagentRunId: 'child-run', name: 'worker', parentToolCallId: 'parent' },
        ...start('child-tool').map(event => ({ ...event, subagentRunId: 'child-run' })),
        { ...chunk('child-tool', 'nested partial'), subagentRunId: 'child-run' });
      await until(() => nestedResult()?.type === 'tool-call' && nestedResult()?.result === 'nested partial');
      expect(f.result('parent')).toBeUndefined();
      await f.push({ ...final('child-tool', 'nested final'), subagentRunId: 'child-run' },
        { type: 'SUBAGENT_FINISHED', subagentRunId: 'child-run' }, final('parent', 'parent done'));
      await f.finish();
      expect(nestedResult()).toMatchObject({ result: 'nested final' });
      expect(f.result('parent')).toBe('parent done');
    } finally { await f.close(); }
  });

  it('retains partial output and native error status when the run fails', async () => {
    const f = await fixture(true);
    try {
      await f.begin();
      await f.push(...start('a'), chunk('a', 'before failure'));
      await until(() => f.shown('before failure'));
      await f.push({ type: 'RUN_ERROR', message: 'analysis failed' });
      await act(async () => { f.requests.at(-1)!.stream.close(); });
      await until(() => !f.runtime.thread.getState().isRunning);
      expect(f.result('a')).toBe('before failure');
      expect(f.tree.root.findByProps({ 'data-tool': 'a' }).props['data-status']).toBe('incomplete');
      expect(f.requests).toHaveLength(1);
    } finally { await f.close(); }
  });
});
