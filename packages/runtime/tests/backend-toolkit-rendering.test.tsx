import { groupPartByType, MessagePrimitive, ThreadPrimitive, useAui, type AssistantRuntime } from '@assistant-ui/react';
import { HttpAgent, type RunAgentInput } from '@ag-ui/client';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { expect, it } from 'vitest';
import { ConversationRuntimeProvider } from '../src/ConversationRuntimeProvider.js';
import { ConversationToolRendererContext } from '../src/conversation-support/tool-renderer-context.js';
import type { ConversationToolCallProps, ConversationToolkit } from '../src/plugin-api/conversation.js';
import { createEphemeralConversationThreadBinding } from '../src/threads/ephemeral-thread-binding.js';

const groupBy = groupPartByType({ 'tool-call': ['group-tool'], 'standalone-tool-call': [] });
const cases = [
  { display: 'inline', custom: false },
  { display: 'standalone', custom: false },
  { display: 'standalone', custom: true },
] as const;

it.each(cases)('renders a $display backend tool (custom=$custom) without exposing a frontend executor', async ({ display, custom }) => {
  let runtime!: AssistantRuntime;
  let tree!: ReactTestRenderer;
  const requests: RunAgentInput[] = [];
  const DefaultUI = ({ result }: ConversationToolCallProps) => <output data-tool-view='default'>{JSON.stringify(result)}</output>;
  const CustomUI = ({ result }: ConversationToolCallProps) => <output data-tool-view='custom'>{JSON.stringify(result)}</output>;
  const toolkit = { bash: { type: 'backend', display, ...(custom ? { render: CustomUI } : {}) } } satisfies ConversationToolkit;
  const factory: NonNullable<Parameters<typeof ConversationRuntimeProvider>[0]['unstable_agentFactory']> = ({ threadId }) => new HttpAgent({
    url: 'https://example.test/agent', threadId,
    fetch: async (_url, init) => {
      const input = JSON.parse(String(init.body)) as RunAgentInput;
      requests.push(input);
      const run = { threadId: input.threadId, runId: input.runId };
      const events = [
        { type: 'RUN_STARTED', ...run },
        { type: 'TOOL_CALL_START', toolCallId: 'bash-1', toolCallName: 'bash', parentMessageId: 'answer' },
        { type: 'TOOL_CALL_ARGS', toolCallId: 'bash-1', delta: '{"command":"pwd"}' },
        { type: 'TOOL_CALL_END', toolCallId: 'bash-1' },
        { type: 'TOOL_CALL_RESULT', toolCallId: 'bash-1', messageId: 'result', role: 'tool', content: '{"output":"workspace"}' },
        { type: 'RUN_FINISHED', ...run },
      ];
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
    },
  });
  function AssistantMessage() {
    return <MessagePrimitive.GroupedParts groupBy={groupBy}>{({ part, children }) => {
      if (part.type === 'group-tool') return <section data-tool-group=''>{children}</section>;
      return part.type === 'tool-call' ? part.toolUI : null;
    }}</MessagePrimitive.GroupedParts>;
  }
  function Capture() {
    runtime = useAui().threads.__internal_getAssistantRuntime!();
    return <ThreadPrimitive.Messages components={{ AssistantMessage, UserMessage: () => null }} />;
  }
  async function until(predicate: () => boolean) {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (predicate()) return;
      await act(async () => { await new Promise<void>(resolve => setTimeout(resolve, 5)); });
    }
    throw new Error('BACKEND_TOOL_UI_DID_NOT_SETTLE');
  }
  await act(async () => {
    tree = create(<ConversationToolRendererContext.Provider value={DefaultUI}>
      <ConversationRuntimeProvider toolkit={toolkit} threadBinding={createEphemeralConversationThreadBinding()} unstable_agentFactory={factory}>
        <Capture />
      </ConversationRuntimeProvider>
    </ConversationToolRendererContext.Provider>);
  });
  try {
    await until(() => !runtime.thread.getState().isLoading);
    await act(async () => runtime.thread.append('Run pwd'));
    await until(() => requests.length === 1 && !runtime.thread.getState().isRunning);
    const result = tree.root.findByProps({ 'data-tool-view': custom ? 'custom' : 'default' });
    expect(result.children.join('')).toBe('{"output":"workspace"}');
    const groups = tree.root.findAllByProps({ 'data-tool-group': '' });
    expect(groups).toHaveLength(display === 'inline' ? 1 : 0);
    expect(requests[0]?.tools).toEqual([]);
    expect(requests).toHaveLength(1);
  } finally { await act(async () => tree.unmount()); }
});
