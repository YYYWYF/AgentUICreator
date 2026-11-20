// @vitest-environment jsdom
import { act, useEffect, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useAui, type AssistantRuntime, type AttachmentAdapter, type CompleteAttachment } from '@assistant-ui/react';
import { ConversationRuntimeProvider, createEphemeralConversationThreadBinding, type ConversationLoadedThread } from '@za38.03/agent-ui-runtime';
import { HttpAgent, type RunAgentInput } from '@ag-ui/client';
import { createComposerInputController, useComposer, type ComposerRequestAdapter } from '../src/composer-support';
import { AgentUILocaleProvider, AgentUIRoot, ConversationComposerQuotePreview, ConversationThread } from '../src/public';
import { ConversationSkills, type ConversationSkill, type ConversationSkillItem } from '../src/plugins/skills/adapters/presentation/skills';
import { ConversationComposerPlugin as NpmComposer } from '../dist/composer/index.js';
import skillsDefinition, { SkillsPlugin as NpmBar } from '../dist/skills/index.js';
import selectionDefinition, { SkillsSelectionPlugin as NpmSelection } from '../dist/skills-selection/index.js';
import { SkillsPlugin as LocalBar } from '../dist/sources/takeover/skills/index';
import localSkillsDefinition from '../dist/sources/takeover/skills/definition';
import { SkillsSelectionPlugin as LocalSelection } from '../dist/sources/takeover/skills-selection/index';
import { ConversationComposerPlugin as LocalComposer } from '../dist/sources/takeover/composer/index';
import { requestAdapter as defaultRequestAdapter } from '../src/plugins/composer/adapters/application-request-adapter';
import { skillsMessageDataAdapter, type ConversationSkillData, readSubmittedSkill } from '../src/plugins/skills/adapters/presentation/skill-data';
import { projectConversationDetail } from '../src/plugins/conversation-service/adapters/presentation/conversation-history-projector';

import { PluginInstanceProvider, PluginServiceRuntimeProvider } from '@za38.03/agent-ui-runtime/plugin-api';
import type { UIPluginSetupContext } from '@za38.03/agent-ui-runtime/contracts';
import type { ConversationSkillsService } from '../src/plugins/skills/adapters/presentation/service';
const actions = { sendMessage: async () => {}, resumeInterrupts: async () => {}, startNewConversation: async () => {}, abortRun() {} };
const events = { subscribe: () => () => {} };
const skillInstance = { id: 'custom-skills-picker', pluginId: 'skills', enabled: true };
const controllerFactory = () => createComposerInputController({ messageData: skillsMessageDataAdapter });
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); });
async function render(node: ReactNode) {
  if (!root) { const host = document.createElement('div'); document.body.append(host); root = createRoot(host); }
  await act(async () => root!.render(<AgentUIRoot theme='violet'><AgentUILocaleProvider locale='zh-CN'>{node}</AgentUILocaleProvider></AgentUIRoot>));
}
function button(text: string) { return [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === text)!; }
const skill: ConversationSkill = { kind: 'skill', id: 'research', label: '深度研究' };
const selected: ConversationSkillData = { id: 'research', label: '深度研究' };
const variants = [
  { name: 'npm', definition: skillsDefinition, Composer: NpmComposer, Bar: NpmBar, Selection: NpmSelection },
  { name: 'source-owned bar', definition: localSkillsDefinition, Composer: NpmComposer, Bar: LocalBar, Selection: NpmSelection },
  { name: 'source-owned preview', definition: skillsDefinition, Composer: NpmComposer, Bar: NpmBar, Selection: LocalSelection },
  { name: 'source-owned Composer', definition: skillsDefinition, Composer: LocalComposer, Bar: NpmBar, Selection: NpmSelection },
];
async function fixture(variant = variants[0]!, custom: { attachmentAdapter?: AttachmentAdapter; composerAdapter?: ComposerRequestAdapter | null; history?: ConversationLoadedThread; showBar?: boolean; showPreview?: boolean } = {}) {
  const values = new Map<string, unknown>();
  const services: UIPluginSetupContext['services'] = {
    get: <T,>(name: string) => values.get(name) as T | undefined,
    provide<T>(name: string, value: T) { values.set(name, value); return () => { values.delete(name); }; },
  };
  const cleanup = variant.definition.setup!({ instance: skillInstance, services, actions, events });
  const service = services.get<ConversationSkillsService>('conversation.skills')!;
  const serviceRuntime = { get: services.get, subscribe: () => () => {}, getRevision: () => 0 };
  function Services({ children }: { children: ReactNode }) {
    useEffect(() => () => { if (typeof cleanup === 'function') cleanup(); }, []);
    return <PluginServiceRuntimeProvider runtime={serviceRuntime}>{children}</PluginServiceRuntimeProvider>;
  }
  function SkillsScope({ children }: { children: ReactNode }) {
    return <PluginInstanceProvider instance={skillInstance} actions={actions} events={events}>{children}</PluginInstanceProvider>;
  }
  const requests: RunAgentInput[] = [];
  let native!: AssistantRuntime;
  let composer!: import("@za38.03/agent-ui-plugins").ComposerController;
  let setPreviewVisible!: (visible: boolean) => void;
  let setBarVisible!: (visible: boolean) => void;
  function Capture() { native = useAui().threads.__internal_getAssistantRuntime!(); composer = useComposer('test-control'); return null; }
  const base = createEphemeralConversationThreadBinding();
  const binding = { ...base, ...(custom.history ? { loadThread: async () => custom.history! } : {}) };
  const factory = ({ threadId }: { threadId: string }) => new HttpAgent({ threadId, url: 'http://example.test/agent', fetch: async (_url, init) => {
    const input = JSON.parse(String(init.body)) as RunAgentInput;
    requests.push(input);
    return new Response([{ type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId },
      { type: 'RUN_FINISHED', threadId: input.threadId, runId: input.runId }].map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
      { headers: { 'Content-Type': 'text/event-stream' } });
  } });
  function ComposerWithPlugins() {
    const [previewVisible, setVisible] = useState(custom.showPreview !== false);
    const [barVisible, setBar] = useState(custom.showBar !== false);
    setPreviewVisible = setVisible;
    setBarVisible = setBar;
    return <variant.Composer requestAdapter={custom.composerAdapter === null ? undefined : custom.composerAdapter ?? defaultRequestAdapter}
      renderSlot={(_name, fallback) => fallback} renderScopedSlot={(_name, _scope, fallback) => fallback}
      triggers={barVisible ? <SkillsScope><variant.Bar items={[skill]} /></SkillsScope> : null}
      beforeInput={<>{previewVisible && <variant.Selection />}<ConversationComposerQuotePreview /></>} />;
  }
  await render(<Services><ConversationRuntimeProvider inputControllerFactory={controllerFactory} endpoint='http://example.test/agent'
    threadBinding={binding} attachmentAdapter={custom.attachmentAdapter} ctx={{ tenant: 'host' }} unstable_agentFactory={factory}>
    <SkillsScope><Capture /></SkillsScope><ConversationThread autoFocus={false} composer={<ComposerWithPlugins />} />
  </ConversationRuntimeProvider></Services>);
  await vi.waitFor(async () => { await act(async () => {}); expect(native.thread.getState().isLoading).toBe(false); });
  return { requests, service,
    get selected() { return service.getSnapshot(native.threads.getState().mainThreadId); },
    select(value: ConversationSkillData) { service.select(native.threads.getState().mainThreadId, value, composer); },
    get native() { return native; }, get composer() { return composer; },
    async showPreview(visible: boolean) { await act(async () => setPreviewVisible(visible)); },
    async showBar(visible: boolean) { await act(async () => setBarVisible(visible)); },
    async send(text = 'Question') {
      const count = requests.length + 1;
      await act(async () => { native.thread.composer.setText(text); native.thread.composer.send(); });
      await vi.waitFor(async () => { await act(async () => {}); expect(requests).toHaveLength(count); expect(native.thread.getState().isRunning).toBe(false); });
    },
  };
}

it.each(variants)('$name composes one removable skill preview alongside quote and draft', async variant => {
  const f = await fixture(variant);
  await act(async () => { f.composer.setText('保留草稿'); f.composer.setQuote({ text: '保留引用', messageId: 'origin' }); button('深度研究').click(); });
  expect(f.selected).toEqual(selected);
  expect(document.querySelector('[data-slot="composer-skill"]')?.closest('[data-slot="aui_composer-before-input"]')).not.toBeNull();
  expect(document.querySelectorAll('[data-slot="composer-skill"]')).toHaveLength(1);
  expect(document.querySelector('[data-slot="composer-quote"]')?.textContent).toContain('保留引用');
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="移除技能: 深度研究"]')!.click());
  expect(f.selected).toBeNull();
  expect(f.composer.getState().text).toBe('保留草稿');
  expect(f.composer.getState().quote?.text).toBe('保留引用');
});

it.each(variants)('$name submits ctx.skill and retains a read-only message badge after clearing the draft', async variant => {
  const f = await fixture(variant);
  await act(async () => button('深度研究').click());
  await f.send();
  expect(f.requests[0]!.forwardedProps).toEqual({ ctx: { tenant: 'host', skill: selected } });
  expect(f.requests[0]!.messages[0]!.metadata).toMatchObject({ skill: selected });
  expect(f.selected).toBeNull();
  expect(document.querySelector('[data-slot="composer-skill"]')).toBeNull();
  expect(document.querySelector('[data-slot="message-skill"]')?.textContent).toContain('深度研究');
  expect(document.querySelector('[data-slot="message-skill"] button')).toBeNull();
});

it('supports Service selection with the selector UI hidden', async () => {
  const f = await fixture(undefined, { showBar: false });
  await act(async () => { f.select(selected); });
  expect(document.querySelector('[data-slot="composer-skill"]')?.textContent).toContain('深度研究');
  await f.send();
  expect(f.requests[0]!.forwardedProps).toEqual({ ctx: { tenant: 'host', skill: selected } });
});

it('does not render a built-in preview when the preview Plugin is absent', async () => {
  const f = await fixture(undefined, { showPreview: false });
  await act(async () => button('深度研究').click());
  expect(document.querySelector('[data-slot="composer-skill"]')).toBeNull();
  expect(f.selected).toEqual(selected);
  await f.send();
  expect(f.requests[0]!.forwardedProps).toHaveProperty('ctx.skill', selected);
});

it('only collects skill data when the project requestAdapter is absent', async () => {
  const f = await fixture(undefined, { composerAdapter: null });
  await act(async () => button('深度研究').click());
  expect(f.selected).toEqual(selected);
  expect(f.composer).not.toHaveProperty('setSkill');
  expect(f.composer).not.toHaveProperty('skill');
  await f.send();
  expect(f.requests[0]!.forwardedProps).toEqual({ ctx: { tenant: 'host' } });
  expect(f.requests[0]!.messages[0]!.metadata).toMatchObject({ skill: selected });
});

it('lets project code map skill data to its own ctx field without a default ctx.skill merge', async () => {
  const f = await fixture(undefined, { composerAdapter: ({ request, pluginData, sources }) => {
    const skill = readSubmittedSkill(pluginData, sources);
    return { ...request, forwardedProps: { ctx: { skillId: skill?.id } } };
  } });
  await act(async () => button('深度研究').click());
  await f.send();
  expect(f.requests[0]!.forwardedProps).toEqual({ ctx: { skillId: selected.id } });
});

it.each(variants)('$name removes and remounts the preview without clearing shared skill or draft state', async variant => {
  const f = await fixture(variant);
  await act(async () => { button('深度研究').click(); f.composer.setText('保留草稿'); });
  await f.showPreview(false);
  expect(document.querySelector('[data-slot="composer-skill"]')).toBeNull();
  expect(f.selected).toEqual(selected);
  expect(f.composer.getState().text).toBe('保留草稿');
  expect(button('深度研究').getAttribute('aria-pressed')).toBe('true');
  await f.showPreview(true);
  expect(document.querySelectorAll('[data-slot="composer-skill"]')).toHaveLength(1);
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="移除技能: 深度研究"]')!.click());
  expect(f.selected).toBeNull();
  expect(button('深度研究').getAttribute('aria-pressed')).toBe('false');
});

it('declares the preview dependency on the skills Service', () => {
  expect(selectionDefinition.manifest.id).toBe('skills-selection');
  expect(selectionDefinition.manifest.capabilities).toContain('conversation-composer-before-input');
  expect(selectionDefinition.inject).toEqual(['conversation.skills']);
  expect(selectionDefinition.provides ?? []).toEqual([]);
});

it.each(variants)('$name removes the selector without clearing the shared skill or preview', async variant => {
  const f = await fixture(variant);
  await act(async () => button('深度研究').click());
  await f.showBar(false);
  expect(document.querySelector('[data-ui-plugin="skills"]')).toBeNull();
  expect(f.selected).toEqual(selected);
  expect(document.querySelector('[data-slot="composer-skill"]')?.textContent).toContain('深度研究');
  await f.send();
  expect(f.requests[0]!.forwardedProps).toHaveProperty('ctx.skill', selected);
});

it('lets the final Composer adapter replace the wire format while keeping the UI snapshot', async () => {
  const f = await fixture(undefined, { composerAdapter: ({ request, pluginData, sources }) => ({ ...request,
    forwardedProps: { operation: readSubmittedSkill(pluginData, sources) } }) });
  await act(async () => { f.select(selected); });
  await f.send();
  expect(f.requests[0]!.forwardedProps).toEqual({ operation: selected });
  expect(document.querySelector('[data-slot="message-skill"]')?.textContent).toContain('深度研究');
});

it('restores a skill badge from public persisted metadata without private draft state', async () => {
  const messages = projectConversationDetail({ id: 'persisted', title: 'History', history: { format: 'langchain', messages: [
    { type: 'human', id: 'old-user', content: 'Saved question', additional_kwargs: { metadata: { skill: selected } } },
  ] } });
  expect(messages[0]?.metadata).toMatchObject({ custom: { skill: selected } });
  await fixture(undefined, { showBar: false, history: { messages } });
  expect(document.querySelector('[data-slot="message-skill"]')?.textContent).toContain('深度研究');
  expect(document.querySelector('[data-slot="composer-skill"]')).toBeNull();
});

it('keeps the previous skill on invalid selection and clears it on navigation', async () => {
  const f = await fixture();
  await act(async () => { f.select(selected); });
  expect(() => f.select({ id: '', label: 'Invalid' })).toThrow('AGENT_UI_INVALID_SKILL');
  expect(f.selected).toEqual(selected);
  const originalThreadId = f.native.threads.getState().mainThreadId;
  await act(async () => f.native.threads.switchToNewThread());
  expect(f.selected).toBeNull();
  expect(f.service.getSnapshot(originalThreadId)).toBeNull();
});

it('records the source Plugin and custom instance automatically without forwarding raw data', async () => {
  const adapter = vi.fn<ComposerRequestAdapter>(defaultRequestAdapter);
  const f = await fixture(undefined, { composerAdapter: adapter });
  await act(async () => button('深度研究').click());
  await f.send();
  const input = adapter.mock.calls[0]![0];
  expect(input.pluginData).toEqual({ 'custom-skills-picker': selected });
  expect(input.sources).toEqual({ 'custom-skills-picker': { pluginId: 'skills', instanceId: 'custom-skills-picker' } });
  expect(input.request.forwardedProps).toEqual({ ctx: { tenant: 'host' } });
});

it('keeps UI state in the Service when collected Composer data is cleared directly', async () => {
  const f = await fixture();
  await act(async () => { f.select(selected); f.composer.clearData(); });
  expect(f.selected).toEqual(selected);
  expect(document.querySelector('[data-slot="composer-skill"]')?.textContent).toContain('深度研究');
});

it('disposes the Service selection and its collected data when the provider stops', async () => {
  const f = await fixture();
  await act(async () => { button('深度研究').click(); f.service.dispose(); });
  expect(f.selected).toBeNull();
  expect(document.querySelector('[data-slot="composer-skill"]')).toBeNull();
  await f.send();
  expect(f.requests[0]!.forwardedProps).toEqual({ ctx: { tenant: 'host' } });
});

it('preserves the next Service selection while an attachment submission finishes', async () => {
  let complete: ((attachment: CompleteAttachment) => void) | undefined;
  const f = await fixture(undefined, { attachmentAdapter: {
    accept: 'text/plain',
    async add({ file }) { return { id: 'upload', type: 'document', name: file.name, file,
      status: { type: 'requires-action', reason: 'composer-send' } }; },
    async remove() {},
    send() { return new Promise(resolve => { complete = resolve; }); },
  } });
  await act(async () => {
    await f.composer.addAttachment(new File(['file'], 'file.txt', { type: 'text/plain' }));
    button('深度研究').click();
    f.composer.setText('Original');
    f.composer.send();
  });
  await vi.waitFor(() => expect(complete).toBeDefined());
  const next = { id: 'report', label: 'Next' };
  await act(async () => { f.select(next); f.composer.setText('Next draft'); });
  await act(async () => complete!({ id: 'upload', type: 'document', name: 'file.txt',
    status: { type: 'complete' }, content: [{ type: 'text', text: 'File' }] }));
  await vi.waitFor(() => { expect(f.requests).toHaveLength(1); expect(f.native.thread.getState().isRunning).toBe(false); });
  expect(f.requests[0]!.forwardedProps).toHaveProperty('ctx.skill', selected);
  expect(f.selected).toEqual(next);
  expect(f.composer.text).toBe('Next draft');
  await f.send();
  expect(f.requests[1]!.forwardedProps).toHaveProperty('ctx.skill', next);
  expect(f.selected).toBeNull();
});

it('clears Service selection and collected data on native composer reset', async () => {
  const f = await fixture();
  await act(async () => button('深度研究').click());
  await act(async () => { await f.native.thread.composer.reset(); });
  expect(f.selected).toBeNull();
  expect(document.querySelector('[data-slot="composer-skill"]')).toBeNull();
  await f.send();
  expect(f.requests[0]!.forwardedProps).toEqual({ ctx: { tenant: 'host' } });
});

it('shows two shortcuts, keeps all skills searchable and never submits the enclosing form on selection', async () => {
  const change = vi.fn(), submit = vi.fn();
  const items: ConversationSkillItem[] = [skill, {kind:'skill',id:'report',label:'生成报告'}, {kind:'skill',id:'data',label:'分析数据'}];
  await render(<form onSubmit={submit}><ConversationSkills items={items} onSelectedSkillChange={change}/></form>);
  expect([...document.querySelectorAll('.skills-bar button')].map(node => node.textContent)).toEqual(['深度研究','生成报告','更多']);
  await act(async () => button('更多').click());
  await act(async () => document.querySelector<HTMLButtonElement>('.skills-item-select:last-child')!.click());
  expect(change).toHaveBeenLastCalledWith(items[2]); expect(submit).not.toHaveBeenCalled();
});

it('runs a project callback on click, blocks duplicates and reports failures', async () => {
  let reject!: (reason: unknown) => void;
  const start = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  await render(<div data-agent-ui-conversation='true'><ConversationSkills items={[{kind:'workflow',id:'weekly',label:'生成周报',onStart:start}]}/></div>);
  await act(async () => button('更多').click());
  expect(document.querySelector('.skills-popover')?.closest('[data-agent-ui-conversation]')).toBeTruthy();
  expect(start).not.toHaveBeenCalled();
  const trigger = document.querySelector<HTMLButtonElement>('[aria-label="执行: 生成周报"]')!;
  await act(async () => { trigger.click(); trigger.click(); }); expect(start).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error('internal secret')));
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('操作执行失败，请重试。');
  expect(document.body.textContent).not.toContain('internal secret'); expect(trigger.disabled).toBe(false);
});
