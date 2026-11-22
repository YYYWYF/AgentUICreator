// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AgentUILocaleProvider, NavigationMenu } from '../src/public';
import { StackNavigationRuntime } from '../../runtime/src/ui/runtime/layout/StackNavigationRuntime';

it.each(['en-US', 'zh-CN'] as const)('controls a Runtime Stack using shared %s copy', async locale => {
  const service = new StackNavigationRuntime();
  service.reconcile({ type: 'stack', id: 'main', viewIds: ['chat', 'files'],
    children: [{ type: 'slot', id: 'chat', slotId: 'chat' }, { type: 'slot', id: 'files', slotId: 'files' }] });
  const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<AgentUILocaleProvider locale={locale}><NavigationMenu service={service} items={[{id:'chat',type:'view',viewId:'chat',label:locale === 'zh-CN' ? '聊天' : 'Chat'}]} /></AgentUILocaleProvider>));
    const button = host.querySelector<HTMLButtonElement>('[data-sidebar="menu-button"]')!;
    expect(button.textContent).toBe(locale === 'zh-CN' ? '聊天' : 'Chat');
    expect(button.getAttribute('aria-current')).toBe('page');
    await act(async () => service.selectView('main', 'files'));
    expect(button.getAttribute('aria-current')).toBeNull();
    await act(async () => button.click());
    expect(service.getSnapshot().stacks.main?.activeViewId).toBe('chat');
    await act(async () => root.render(<AgentUILocaleProvider locale={locale}><NavigationMenu service={service} stackId='constructor' items={[{id:'chat',type:'view',viewId:'chat',label:locale === 'zh-CN' ? '聊天' : 'Chat'}]} /></AgentUILocaleProvider>));
    expect(host.querySelector('[data-sidebar="menu-button"]')!.matches(':disabled, [aria-disabled="true"]')).toBe(true);
  } finally { await act(async () => root.unmount()); }
});

it('uses the existing Sidebar collapse state while preserving each menu icon and mounted history', async () => {
  const service = new StackNavigationRuntime();
  service.reconcile({ type: 'stack', id: 'main', viewIds: ['chat', 'projects'],
    children: [{ type: 'slot', id: 'chat', slotId: 'chat' }, { type: 'slot', id: 'projects', slotId: 'projects' }] });
  const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<AgentUILocaleProvider locale='zh-CN'><NavigationMenu service={service}
      content={<input defaultValue='历史搜索' />} items={[
        { id: 'chat', type: 'view', viewId: 'chat', label: '聊天', icon: <svg data-icon='chat' /> },
        { id: 'projects', type: 'view', viewId: 'projects', label: '项目空间', icon: <svg data-icon='projects' /> },
      ]} /></AgentUILocaleProvider>));
    const icon = host.querySelector('[data-icon="projects"]');
    const history = host.querySelector('input');
    const sidebar = host.querySelector('[data-slot="sidebar"]');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-sidebar="trigger"]')!.click());
    expect(sidebar?.getAttribute('data-state')).toBe('collapsed');
    expect(host.querySelector('[data-icon="projects"]')).toBe(icon);
    expect(host.querySelector<HTMLInputElement>('input')).toBe(history);
    expect(host.querySelector('.navigation-menu-history')?.hasAttribute('inert')).toBe(true);
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="项目空间"]')!.click());
    expect(service.getSnapshot().stacks.main?.activeViewId).toBe('projects');
    expect(sidebar?.getAttribute('data-state')).toBe('collapsed');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-sidebar="trigger"]')!.click());
    expect(sidebar?.getAttribute('data-state')).toBe('expanded');
    expect(history?.value).toBe('历史搜索');
  } finally { await act(async () => root.unmount()); }
});

it.each(['en-US', 'zh-CN'] as const)('provides an extensible default new-conversation action in %s without a Stack', async locale => {
  const host = document.createElement('div'), root = createRoot(host);
  const create = vi.fn(async () => {}), custom = vi.fn();
  try {
    await act(async () => root.render(<AgentUILocaleProvider locale={locale}><NavigationMenu presentation='toolbar'
      onNewConversation={create} items={defaults => [...defaults, { id: 'custom', type: 'action', label: 'Custom', onSelect: custom }]} /></AgentUILocaleProvider>));
    const button = host.querySelector<HTMLButtonElement>('[data-menu-item-id="new-chat"]')!;
    expect(button.getAttribute('aria-label')).toBe(locale === 'zh-CN' ? '新建会话' : 'New conversation');
    expect(button.querySelector('.navigation-menu-label')).toBeNull();
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button.getAttribute('aria-current')).toBeNull();
    await act(async () => button.click()); expect(create).toHaveBeenCalledOnce();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-menu-item-id="custom"]')!.click()); expect(custom).toHaveBeenCalledOnce();
    await act(async () => root.render(<AgentUILocaleProvider locale={locale}><NavigationMenu items={[]} /></AgentUILocaleProvider>));
    expect(host.querySelector('[data-menu-item-id]')).toBeNull();
  } finally { await act(async () => root.unmount()); }
});

it('guards pending actions and presents localized action failures without changing selected views', async () => {
  const host = document.createElement('div'), root = createRoot(host);
  let rejectAction: ((reason: Error) => void) | undefined;
  const action = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectAction = reject; }));
  try {
    await act(async () => root.render(<AgentUILocaleProvider locale='zh-CN'><NavigationMenu onNewConversation={action} /></AgentUILocaleProvider>));
    const button = host.querySelector<HTMLButtonElement>('[data-menu-item-id="new-chat"]')!;
    await act(async () => { button.click(); button.click(); });
    expect(action).toHaveBeenCalledOnce();
    await act(async () => rejectAction?.(new Error('failed')));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('操作失败，请重试。');
    expect(button.getAttribute('aria-disabled')).toBeNull();
  } finally { await act(async () => root.unmount()); }
});
