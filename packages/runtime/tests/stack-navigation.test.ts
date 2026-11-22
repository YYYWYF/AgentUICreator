import { expect, it } from 'vitest';
import type { StackNode } from '@za38.03/agent-ui-renderer';
import { StackNavigationRuntime } from '../src/ui/runtime/layout/StackNavigationRuntime.js';
import { STACK_NAVIGATION_SERVICE, type UIPluginDefinition } from '../src/contracts/index.js';
import { PluginServiceRuntime } from '../src/ui/runtime/plugins/PluginServiceRuntime.js';
import { createPluginRegistry } from '../src/ui/runtime/plugins/PluginRegistry.js';
import { parseAppUIModel } from '../src/ui/framework/contracts/app-ui-model.js';
import { compileAppUIModel } from '../src/ui/framework/contracts/app-ui-compiler.js';

const stack = (views = ['chat', 'files']): StackNode => ({
  type: 'stack', id: 'main', viewIds: views, keepMounted: true,
  children: views.map(id => ({ type: 'slot', id, slotId: id })),
});

it('owns selection independently per Agent and preserves stable identities through reorder and removal', () => {
  const first = new StackNavigationRuntime(), second = new StackNavigationRuntime();
  first.reconcile(stack()); second.reconcile(stack());
  const before = first.getSnapshot();
  first.selectView('main', 'chat'); first.reconcile(stack());
  expect(first.getSnapshot()).toBe(before);
  first.selectView('main', 'files');
  first.reconcile(stack(['files', 'chat']));
  expect(first.getSnapshot().stacks.main?.activeViewId).toBe('files');
  expect(second.getSnapshot().stacks.main?.activeViewId).toBe('chat');
  first.reconcile(stack(['chat']));
  expect(first.getSnapshot().stacks.main?.activeViewId).toBe('chat');
  expect(() => first.selectView('main', 'missing')).toThrow('STACK_NAVIGATION_VIEW_NOT_FOUND');
  expect(() => first.selectView('constructor', 'chat')).toThrow('STACK_NAVIGATION_STACK_NOT_FOUND');
  first.clear(); expect(first.getSnapshot().stacks).toEqual({});
});

it('provides navigation from Runtime without a provider Plugin and honors declared injection', () => {
  const runtime = new PluginServiceRuntime();
  const definition: UIPluginDefinition = {
    manifest: { id: 'consumer', name: 'Consumer', description: 'Test consumer', version: '0.0.1' },
    inject: [STACK_NAVIGATION_SERVICE],
    Component: () => null,
  };
  runtime.reconcile({ root: stack(), pluginInstances: {
    consumer: { id: 'consumer', pluginId: 'consumer', enabled: true, mount: { slotId: 'files' } },
  } }, createPluginRegistry([definition]), {
    sendMessage: async () => {}, resumeInterrupts: async () => {}, startNewConversation: async () => {}, abortRun: () => {},
  });
  expect(runtime.getActivation('consumer')?.status).toBe('active');
  expect(runtime.get(STACK_NAVIGATION_SERVICE)).toBe(runtime.stackNavigation);
  runtime.stackNavigation.selectView('main', 'files');
  runtime.dispose(); expect(runtime.stackNavigation.getSnapshot().stacks).toEqual({});
});

it('compiles additive Stack options and validates semantic branch identities without migrating legacy models', () => {
  const model = parseAppUIModel({ root: { type: 'stack', id: 'main', viewIds: ['chat', 'files'], keepMounted: true,
    children: [{ type: 'slot', plugins: [] }, { type: 'slot', plugins: [] }] } });
  expect(compileAppUIModel(model, {}).root).toMatchObject({ type: 'stack', id: 'main', keepMounted: true, viewIds: ['chat', 'files'] });
  expect(() => parseAppUIModel({ root: { ...model.root, viewIds: ['chat'] } })).toThrow();
  const legacy = compileAppUIModel(parseAppUIModel({ root: { type: 'stack', activeIndex: 1,
    children: [{ type: 'slot', plugins: [] }, { type: 'slot', plugins: [] }] } }), {}).root;
  expect(legacy.type).toBe('stack');
  expect(legacy).not.toHaveProperty('viewIds');
  expect(legacy).not.toHaveProperty('keepMounted');
});

it('requires a unique Stack id for viewIds arrays and rejects the former object shape', () => {
  const children = [{ type: 'slot', plugins: [] }];
  const named = { type: 'stack', id: 'main', viewIds: ['chat'], children };
  expect(() => parseAppUIModel({ root: { type: 'stack', viewIds: ['chat'], children } })).toThrow();
  expect(() => parseAppUIModel({ root: { ...named, id: ' ' } })).toThrow();
  expect(() => parseAppUIModel({ root: { ...named, navigation: { id: 'main', viewIds: ['chat'] } } })).toThrow();
  expect(() => parseAppUIModel({ root: { type: 'column', children: [named, named] } })).toThrow();
  expect(() => parseAppUIModel({ root: { ...named, viewIds: ['chat', 'chat'], children: [...children, ...children] } })).toThrow();
  expect(() => compileAppUIModel(parseAppUIModel({ root: { ...named, id: 'layout-node:root.children%5B0%5D' } }), {})).toThrow('Duplicate Runtime layout node id');
});

it('preserves selection by the authored Stack id when the container moves within the layout', () => {
  const root = { type: 'stack', id: 'main', viewIds: ['chat', 'files'],
    children: [{ type: 'slot', plugins: [] }, { type: 'slot', plugins: [] }] };
  const runtime = new StackNavigationRuntime();
  runtime.reconcile(compileAppUIModel(parseAppUIModel({ root }), {}).root);
  runtime.selectView('main', 'files');
  runtime.reconcile(compileAppUIModel(parseAppUIModel({ root: { type: 'column', children: [root] } }), {}).root);
  expect(runtime.getSnapshot().stacks.main?.activeViewId).toBe('files');
});
