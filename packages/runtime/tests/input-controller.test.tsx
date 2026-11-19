import { HttpAgent, type RunAgentInput } from '@ag-ui/client';
import { useAui, type AssistantRuntime } from '@assistant-ui/react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { ConversationRuntimeProvider, createEphemeralConversationThreadBinding } from '../src/public.js';
import type { ConversationInputControllerFactory } from '../src/plugin-api/input-controller.js';

let tree: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined; });

async function until(predicate: () => boolean) {
  await vi.waitFor(async () => { await act(async () => {}); expect(predicate()).toBe(true); });
}

async function fixture(inputControllerFactory?: ConversationInputControllerFactory) {
  let native!: AssistantRuntime;
  const requests: RunAgentInput[] = [];
  function Capture() { native = useAui().threads.__internal_getAssistantRuntime!(); return null; }
  await act(async () => {
    tree = create(<ConversationRuntimeProvider
      inputControllerFactory={inputControllerFactory}
      threadBinding={createEphemeralConversationThreadBinding()}
      unstable_agentFactory={({ threadId }) => new HttpAgent({ threadId, url: 'http://example.test/agent', fetch: async (_url, init) => {
        const input = JSON.parse(String(init.body)) as RunAgentInput;
        requests.push(input);
        return new Response([
          { type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId },
          { type: 'RUN_FINISHED', threadId: input.threadId, runId: input.runId },
        ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      } })}
    ><Capture /></ConversationRuntimeProvider>);
  });
  await until(() => !native.thread.getState().isLoading);
  return {
    requests,
    get native() { return native; },
    async send() {
      await act(async () => { native.thread.composer.setText('Question'); native.thread.composer.send(); });
      await until(() => requests.length === 1 && !native.thread.getState().isRunning);
    },
  };
}

it('forwards native input without adding product quote formatting when no controller is selected', async () => {
  const f = await fixture();
  await act(async () => f.native.thread.composer.setQuote({ text: 'Passage', messageId: 'source' }));
  await f.send();
  expect(f.requests[0]!.messages[0]!.content).toBe('Question');
  expect(f.native.thread.getState().messages.find(message => message.role === 'user')?.metadata.custom.quote)
    .toEqual({ text: 'Passage', messageId: 'source' });
});

it('delegates to the selected input controller with the submitted message and concrete Thread lifetime', async () => {
  const attached: string[] = [];
  const cleaned: string[] = [];
  const rendered: string[] = [];
  const loaded: string[] = [];
  const factory: ConversationInputControllerFactory = () => ({
    onHistoryLoaded(threadId) { loaded.push(threadId); },
    Provider: ({ threadId, children }) => { rendered.push(threadId); return children; },
    attach(threadId) { attached.push(threadId); return () => { cleaned.push(threadId); }; },
    transformRequest(input, context) {
      expect(context.runtime).toBeDefined();
      expect(context.submittedMessages.some(message => typeof message === 'object' && message !== null &&
        'id' in message && message.id === input.messages[0]?.id)).toBe(true);
      return { ...input, forwardedProps: { applicationInput: context.threadId } };
    },
  });
  const f = await fixture(factory);
  await f.send();
  const threadId = f.requests[0]!.threadId;
  expect(f.requests[0]!.forwardedProps).toEqual({ applicationInput: threadId });
  expect(attached).toContain(threadId);
  expect(rendered).toContain(threadId);
  expect(loaded).toContain(threadId);
  await act(async () => tree!.unmount());
  tree = undefined;
  expect(cleaned.sort()).toEqual(attached.sort());
});
