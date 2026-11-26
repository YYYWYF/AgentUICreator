// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentUILocaleProvider, ConversationToolResult, type ConversationToolResultProps } from '../src/public.js';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
const roots: Root[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach(root => root.unmount()));
  document.body.replaceChildren();
});
function Host({ children }: { children: ReactNode }) {
  const runtime = useLocalRuntime({ async *run() {} });
  return <AssistantRuntimeProvider runtime={runtime}><AgentUILocaleProvider locale='en-US'>
    {children}
  </AgentUILocaleProvider></AssistantRuntimeProvider>;
}
const tool: ConversationToolResultProps = {
  toolCallId: 'stream', toolName: 'check_workspace', args: {}, argsText: '{}',
  status: { type: 'running' }, defaultExpanded: true,
};
async function mount(props: Partial<ConversationToolResultProps> = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const render = async (next: Partial<ConversationToolResultProps>) => {
    await act(async () => root.render(<Host><ConversationToolResult {...tool} {...next} /></Host>));
  };
  await render(props);
  const trigger = () => container.querySelector<HTMLButtonElement>('[data-slot="tool-fallback-trigger"]')!;
  return { render, trigger };
}

it('collapses only after the final result and lets users reopen it afterwards', async () => {
  const { render, trigger } = await mount({ result: 'first', isPreliminary: true });
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
  await render({ result: 'first\nsecond', status: { type: 'complete' }, isPreliminary: true });
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
  const final = { result: 'finished', status: { type: 'complete' as const }, isPreliminary: false };
  await render(final);
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  await act(async () => trigger().click());
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
  await render(final);
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
});

it.each([
  { type: 'incomplete', reason: 'error' },
  { type: 'incomplete', reason: 'cancelled' },
  { type: 'requires-action', reason: 'tool-calls' },
] satisfies ConversationToolResultProps['status'][] )('keeps details visible for $type / $reason', async status => {
  const { render, trigger } = await mount();
  await render({ status, result: 'partial output' });
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
});

it('preserves explicitly controlled expansion after completion', async () => {
  const { render, trigger } = await mount({ expanded: true });
  await render({ expanded: true, status: { type: 'complete' }, result: 'finished' });
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
});

it('preserves defaultExpanded for an already completed historical tool', async () => {
  const { trigger } = await mount({ status: { type: 'complete' }, result: 'history' });
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
});
