// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AssistantRuntimeProvider, useLocalRuntime, type AssistantRuntime, type RunConfig } from '@assistant-ui/react';
import { PluginServiceRuntimeProvider, PluginServiceConsumerProvider } from '@za38.03/agent-ui-runtime/plugin-api';
import { AgentUILocaleProvider, AgentUIRoot, ConversationComposerQuotePreview } from '../src/public';
import { ConversationSkills, type ConversationSkill, type ConversationSkillItem } from '../src/plugins/skills/adapters/presentation/skills';
import { createConversationSkillsService, CONVERSATION_SKILLS_SERVICE, type ConversationSkillsService } from '../src/plugins/skills/adapters/presentation/service';
import { ConversationComposerPlugin as NpmComposer } from '../dist/composer/index.js';
import { SkillsPlugin as NpmBar } from '../dist/skills/index.js';
import { SkillsSelectionPlugin as NpmSelection } from '../dist/skills-selection/index.js';
import { SkillsPlugin as LocalBar } from '../dist/sources/takeover/skills/index';
import { SkillsSelectionPlugin as LocalSelection } from '../dist/sources/takeover/skills-selection/index';
import { ConversationComposerPlugin as LocalComposer } from '../dist/sources/takeover/composer/index';

let root: Root | undefined;
const services: ConversationSkillsService[] = [];
afterEach(async () => {
  await act(async () => { for (const service of services.splice(0)) service.dispose(); root?.unmount(); });
  root = undefined; document.body.replaceChildren();
});
async function render(node: ReactNode) {
  if (!root) { const host = document.createElement('div'); document.body.append(host); root = createRoot(host); }
  await act(async () => root!.render(<AgentUIRoot theme='violet'><AgentUILocaleProvider locale='zh-CN'>{node}</AgentUILocaleProvider></AgentUIRoot>));
}
function button(text: string) { return [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === text)!; }
const skill: ConversationSkill = { kind: 'skill', id: 'research', label: '深度研究', runConfig: { custom: { skillId: 'research' } } };
function service() { const value = createConversationSkillsService(); services.push(value); return value; }
const variants = [
  { name: 'npm', Composer: NpmComposer, Bar: NpmBar, Selection: NpmSelection },
  { name: 'source-owned bar', Composer: NpmComposer, Bar: LocalBar, Selection: NpmSelection },
  { name: 'source-owned selection', Composer: NpmComposer, Bar: NpmBar, Selection: LocalSelection },
  { name: 'source-owned Composer', Composer: LocalComposer, Bar: NpmBar, Selection: NpmSelection },
];
async function fixture(variant = variants[0]!) {
  const shared = service(); const runs: (RunConfig | undefined)[] = []; let runtime!: AssistantRuntime;
  const port = { get: <T,>(name: string) => name === CONVERSATION_SKILLS_SERVICE ? shared as T : undefined, subscribe: () => () => {}, getRevision: () => 0 };
  function Host() {
    runtime = useLocalRuntime({ async *run(options) { runs.push(options.runConfig); yield { content: [{ type: 'text' as const, text: 'done' }] }; } });
    return <AssistantRuntimeProvider runtime={runtime}><PluginServiceRuntimeProvider runtime={port}>
      <variant.Composer renderSlot={(_name, fallback) => fallback} renderScopedSlot={(_name, _scope, fallback) => fallback}
        triggers={<PluginServiceConsumerProvider scope={{ pluginId: 'skills', instanceId: 'bar', provides: [CONVERSATION_SKILLS_SERVICE], inject: [], optionalInject: ['agent-ui.locale'] }}><variant.Bar items={[skill]} /></PluginServiceConsumerProvider>}
        beforeInput={<><ConversationComposerQuotePreview /><PluginServiceConsumerProvider scope={{ pluginId: 'skills-selection', instanceId: 'selection', provides: [], inject: [CONVERSATION_SKILLS_SERVICE], optionalInject: ['agent-ui.locale'] }}><variant.Selection /></PluginServiceConsumerProvider></>} />
    </PluginServiceRuntimeProvider></AssistantRuntimeProvider>;
  }
  await render(<Host />);
  return { shared, runtime, runs };
}

it.each(variants)('$name renders the label through beforeInput and preserves the quote and draft', async variant => {
  const f = await fixture(variant);
  await act(async () => { f.runtime.thread.composer.setText('保留草稿'); f.runtime.thread.composer.setQuote({ text: '保留引用', messageId: 'origin' }); });
  await act(async () => button('深度研究').click());
  expect(document.querySelector('.skills-selection-chip')?.closest('[data-slot="aui_composer-before-input"]')).toBeTruthy();
  expect(document.querySelectorAll('.skills-selection-chip')).toHaveLength(1);
  expect(document.querySelector('.skills-bar')?.closest('[data-slot="aui_composer-shell"]')).toBeNull();
  expect(document.querySelector('[data-slot="aui_composer-input-accessories"]')).toBeNull();
  expect(document.querySelector('[data-slot="composer-quote"]')?.textContent).toContain('保留引用');
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="移除技能: 深度研究"]')!.click());
  expect(document.querySelector('.skills-selection-chip')).toBeNull();
  expect(f.runtime.thread.composer.getState().text).toBe('保留草稿');
  expect(f.runtime.thread.composer.getState().quote?.text).toBe('保留引用');
});

it('uses the native request snapshot and clears selection only after an accepted send', async () => {
  const f = await fixture();
  await act(async () => f.runtime.thread.composer.setRunConfig({ custom: { keep: 'host', skillId: 'original' } }));
  await act(async () => button('深度研究').click());
  const id = f.runtime.threads.getState().mainThreadId;
  await act(async () => f.runtime.thread.composer.send());
  expect(f.shared.getSnapshot(id)?.id).toBe('research'); expect(f.runs).toHaveLength(0);
  await act(async () => { f.runtime.thread.composer.setText('发送'); await f.runtime.thread.composer.send(); });
  await vi.waitFor(() => expect(f.runs).toHaveLength(1));
  expect(f.runs[0]?.custom).toEqual({ keep: 'host', skillId: 'research' });
  expect(f.shared.getSnapshot(id)).toBeNull();
  expect(f.runtime.thread.composer.getState().runConfig.custom).toEqual({ keep: 'host', skillId: 'original' });
  expect(document.querySelector('.skills-selection-chip')).toBeNull();
});

it('restores the previous concrete Thread without writing into the newly selected Thread', async () => {
  const f = await fixture();
  await act(async () => { f.runtime.thread.composer.setText('seed'); await f.runtime.thread.composer.send(); });
  await vi.waitFor(() => expect(f.runs).toHaveLength(1));
  const originalId = f.runtime.threads.getState().mainThreadId;
  const original = f.runtime.threads.getById(originalId).composer;
  await act(async () => { original.setText('旧会话草稿'); original.setRunConfig({ custom: { keep: 'original' } }); });
  await act(async () => button('深度研究').click());
  await act(async () => f.runtime.threads.switchToNewThread());
  const nextId = f.runtime.threads.getState().mainThreadId;
  expect(nextId).not.toBe(originalId);
  expect(f.shared.getSnapshot(originalId)).toBeNull();
  expect(original.getState().runConfig.custom).toEqual({ keep: 'original' });
  expect(original.getState().text).toBe('旧会话草稿');
  expect(f.runtime.thread.composer.getState().runConfig.custom?.skillId).toBeUndefined();
});

it('isolates service instances and restores only fields still owned by a selection on disposal', () => {
  const one = service(), two = service(); let config: RunConfig = { custom: { keep: 'host', skillId: 'original' } };
  const binding = { getRunConfig: () => config, setRunConfig: (next: RunConfig) => { config = next; } };
  one.select('same-id', skill, binding);
  expect(two.getSnapshot('same-id')).toBeNull();
  config = { custom: { keep: 'newer host', skillId: 'newer owner' } };
  one.updatePresentation('same-id', { ...skill, label: 'Research' });
  expect(one.getSnapshot('same-id')?.label).toBe('Research');
  one.dispose(); expect(config.custom).toEqual({ keep: 'newer host', skillId: 'newer owner' });
  expect(one.getSnapshot('same-id')).toBeNull();
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

it('starts a workflow only on an explicit click, blocks duplicates and reports failures', async () => {
  let reject!: (reason: unknown) => void;
  const start = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  await render(<div data-agent-ui-conversation='true'><ConversationSkills items={[{kind:'workflow',id:'weekly',label:'生成周报',onStart:start}]}/></div>);
  await act(async () => button('更多').click());
  expect(document.querySelector('.skills-popover')?.closest('[data-agent-ui-conversation]')).toBeTruthy();
  expect(start).not.toHaveBeenCalled();
  const trigger = document.querySelector<HTMLButtonElement>('[aria-label="启动: 生成周报"]')!;
  await act(async () => { trigger.click(); trigger.click(); }); expect(start).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error('internal secret')));
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('工作流启动失败，请重试。');
  expect(document.body.textContent).not.toContain('internal secret'); expect(trigger.disabled).toBe(false);
});
