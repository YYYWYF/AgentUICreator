// @vitest-environment jsdom
import { act, type ComponentType, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  AgentUILocaleProvider,
  ConversationCommandDecisionProvider,
  ConversationToolResult,
  type ConversationCommandDecisionBinding,
  type ConversationToolResultProps,
  type ToolCardPresentationProps} from '../src/public.js';
import { ConversationToolResultPlugin as NpmResult } from '../dist/tool-result/index.js';
import { ConversationToolResultPlugin as PortableResult } from '../dist/sources/takeover/tool-result/index';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
const roots: Root[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach(root => root.unmount()));
  document.body.replaceChildren();
});

type ViewProps = ToolCardPresentationProps & { tool: ConversationToolResultProps };
const framework = { renderSlot: () => null, renderScopedSlot: () => null };
const views: { name: string; View: ComponentType<ViewProps> }[] = [
  { name: 'source result', View: ({ tool, ...props }) => <ConversationToolResult {...tool} {...props} /> },
  { name: 'npm result', View: ({ tool, ...props }) => <NpmResult {...framework} tool={tool} {...props} /> },
  { name: 'portable result', View: ({ tool, ...props }) => <PortableResult {...framework} tool={tool} {...props} /> },
];
const appearance = {
  approvalClassNames: { actions: 'project-actions', button: 'project-button', approveButton: 'project-approve', rejectButton: 'project-reject' },
  approvalStyles: { actions: { gap: 18 }, button: { borderRadius: 12, backgroundColor: 'gray' }, approveButton: { backgroundColor: 'navy' }, rejectButton: { color: 'maroon' } },
} satisfies ToolCardPresentationProps;
const tool: ConversationToolResultProps = {
  toolCallId: 'approval-call', toolName: 'review_expense', args: {}, argsText: '{}',
  status: { type: 'requires-action', reason: 'tool-calls' },
};

function Host({ children, decisions = new Map() }: {
  children: ReactNode;
  decisions?: ReadonlyMap<string, ConversationCommandDecisionBinding>;
}) {
  const runtime = useLocalRuntime({ async *run() {} });
  return <AssistantRuntimeProvider runtime={runtime}>
    <AgentUILocaleProvider locale='en-US'>
      <ConversationCommandDecisionProvider decisions={decisions}>{children}</ConversationCommandDecisionProvider>
    </AgentUILocaleProvider>
  </AssistantRuntimeProvider>;
}

async function mount(node: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(node));
  return { container, root };
}

function button(container: HTMLElement, label: string) {
  const found = [...container.querySelectorAll('button')].find(node => node.textContent === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

function expectAppearance(container: HTMLElement) {
  const approve = container.querySelector<HTMLButtonElement>('.project-approve');
  const reject = container.querySelector<HTMLButtonElement>('.project-reject');
  expect(approve?.classList.contains('project-button')).toBe(true);
  expect(approve?.style.backgroundColor).toBe('navy');
  expect(approve?.style.borderRadius).toBe('12px');
  expect(reject?.style.color).toBe('maroon');
  expect(reject?.style.backgroundColor).toBe('gray');
  expect(container.querySelector<HTMLElement>('.project-actions')?.style.gap).toBe('18px');
  expect(container.querySelector('[approvalClassNames], [approvalStyles]')).toBeNull();
}

it.each(views)('$name forwards styles and preserves native approval responses', async ({ View }) => {
  const respond = vi.fn<NonNullable<ConversationToolResultProps['respondToApproval']>>();
  const { container } = await mount(<Host><View {...appearance} tool={{ ...tool, approval: { id: 'native' }, respondToApproval: respond }} /></Host>);
  expectAppearance(container);
  await act(async () => button(container, 'Allow').click());
  expect(respond).toHaveBeenCalledExactlyOnceWith({ approved: true });
  expect(button(container, 'Deny').disabled).toBe(true);
});

it.each(views)('$name keeps legacy command decisions on their original channel', async ({ View }) => {
  const submit = vi.fn<ConversationCommandDecisionBinding['submit']>().mockResolvedValue(undefined);
  const addResult = vi.fn<NonNullable<ConversationToolResultProps['addResult']>>();
  const resume = vi.fn<NonNullable<ConversationToolResultProps['resume']>>();
  const decisions = new Map<string, ConversationCommandDecisionBinding>([[tool.toolCallId, {
    request: { allowedDecisions: ['approve', 'reject'] }, submit,
  }]]);
  const { container } = await mount(<Host decisions={decisions}><View {...appearance} tool={{ ...tool, addResult, resume }} /></Host>);
  expectAppearance(container);
  await act(async () => button(container, 'Deny').click());
  expect(submit).toHaveBeenCalledExactlyOnceWith('reject');
  expect(addResult).not.toHaveBeenCalled();
  expect(resume).not.toHaveBeenCalled();
});

it.each(views)('$name keeps interrupt resumes separate from frontend tool results', async ({ View }) => {
  const resume = vi.fn<NonNullable<ConversationToolResultProps['resume']>>();
  const addResult = vi.fn<NonNullable<ConversationToolResultProps['addResult']>>();
  const { container } = await mount(<Host><View {...appearance} tool={{
    ...tool, status: { type: 'requires-action', reason: 'interrupt' },
    interrupt: { type: 'human', payload: {} }, resume, addResult,
  }} /></Host>);
  expectAppearance(container);
  await act(async () => button(container, 'Allow').click());
  expect(resume).toHaveBeenCalledExactlyOnceWith({ approved: true });
  expect(addResult).not.toHaveBeenCalled();
});

it('keeps rejection, pending locking, failure retry and receipt focus', async () => {
  let fail: ((error: Error) => void) | undefined;
  const respond = vi.fn<NonNullable<ConversationToolResultProps['respondToApproval']>>().mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject; }));
  const render = (settled: boolean) => <Host><ConversationToolResult {...tool} {...appearance}
    status={settled ? { type: 'complete' } : tool.status}
    approval={{ id: 'retry', ...(settled ? { approved: false } : {}) }} respondToApproval={respond} /></Host>;
  const { container, root } = await mount(render(false));
  button(container, 'Deny').focus();
  await act(async () => button(container, 'Deny').click());
  expect(button(container, 'Allow').disabled).toBe(true);
  await act(async () => fail?.(new Error('Retry the decision')));
  expect(container.querySelector('[role=alert]')?.textContent).toBe('Retry the decision');
  expect(button(container, 'Deny').disabled).toBe(false);
  await act(async () => button(container, 'Deny').click());
  expect(respond).toHaveBeenLastCalledWith({ approved: false });
  await act(async () => root.render(render(true)));
  const receipt = container.querySelector('[data-slot=tool-fallback-approval-receipt]');
  expect(receipt?.getAttribute('data-outcome')).toBe('refused');
  expect(container.querySelector('.project-approve')).toBeNull();
  expect(document.activeElement).toBe(receipt);
});

it('styles native options and secondary confirmation without skipping confirmation or changing option ids', async () => {
  const respond = vi.fn<NonNullable<ConversationToolResultProps['respondToApproval']>>();
  const { container } = await mount(<Host><ConversationToolResult {...tool} {...appearance}
    approval={{ id: 'options', options: [
      { id: 'permit', kind: 'allow-once', confirm: true },
      { id: 'refuse', kind: 'reject-once' },
    ] }} respondToApproval={respond} /></Host>);
  expectAppearance(container);
  await act(async () => button(container, 'Allow').click());
  expect(respond).not.toHaveBeenCalled();
  expect(button(container, 'Confirm').classList.contains('project-approve')).toBe(true);
  expect(button(container, 'Back').classList.contains('project-approve')).toBe(false);
  await act(async () => button(container, 'Back').click());
  expectAppearance(container);
  await act(async () => button(container, 'Deny').click());
  expect(respond).toHaveBeenCalledExactlyOnceWith({ optionId: 'refuse' });
});

it('keeps question validation, selection, response shape and non-decision button semantics', async () => {
  const respond = vi.fn<NonNullable<ConversationToolResultProps['respondToApproval']>>();
  const { container } = await mount(<Host><ConversationToolResult {...tool} {...appearance}
    approval={{ id: 'questions', display: 'questions', dismissible: true, questions: [
      { id: 'choice', prompt: 'Choose a plan', options: [{ id: 'basic', label: 'Basic' }] },
    ] }} respondToApproval={respond} /></Host>);
  expect(button(container, 'Send').disabled).toBe(true);
  await act(async () => button(container, 'Basic').click());
  expect(button(container, 'Send').disabled).toBe(false);
  expect(container.querySelector('.project-approve, .project-reject')).toBeNull();
  await act(async () => button(container, 'Send').click());
  expect(respond).toHaveBeenCalledExactlyOnceWith({ answers: { choice: { optionIds: ['basic'] } } });
});

it('keeps frontend completion result strings and readonly settled controls unchanged', async () => {
  const addResult = vi.fn<NonNullable<ConversationToolResultProps['addResult']>>();
  const { container, root } = await mount(<Host><ConversationToolResult {...tool} addResult={addResult} /></Host>);
  await act(async () => button(container, 'Deny').click());
  expect(addResult).toHaveBeenCalledExactlyOnceWith('User denied tool execution');
  await act(async () => root.render(<Host><ConversationToolResult {...tool} {...appearance}
    status={{ type: 'complete' }} approval={{ id: 'settled', approved: true }} /></Host>));
  expect(container.querySelector('[data-slot=tool-fallback-approval-receipt]')?.getAttribute('data-outcome')).toBe('allowed');
  expect(container.querySelector('.project-approve, .project-reject')).toBeNull();
});
