// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentUILocaleProvider, WorkbenchPanel, WorkbenchPanelActions, createWorkbenchPanelService } from '../src/public';
import { createDefaultAgentUIPresetRegistry } from '../../creator/operator/src/bootstrap/default-presets';

const cleanups: (() => void)[] = [];
afterEach(() => act(() => cleanups.splice(0).reverse().forEach(dispose => dispose())));
const contentIds = ['content-a', 'content-b'];
const contentItems = [
  { id: 'content-a', label: 'Content A', content: <textarea data-testid="content-a-draft" /> },
  { id: 'content-b', label: 'Content B', content: <textarea data-testid="content-b-draft" /> },
];

it('has no built-in content, tabs or opener buttons, and accepts an empty service', async () => {
  const service = createWorkbenchPanelService();
  const initial = service.getSnapshot();
  expect(initial).toEqual({ open: false, activeItemId: '', visibleItemIds: [] });
  service.open();
  service.collapse();
  expect(service.getSnapshot()).toBe(initial);
  expect(() => service.open('missing')).toThrow('WORKBENCH_PANEL_ITEM_NOT_FOUND');
  expect(() => service.open('')).toThrow('WORKBENCH_PANEL_ITEM_NOT_FOUND');
  for (const ids of [[''], [' '], ['duplicate', 'duplicate']]) {
    expect(() => createWorkbenchPanelService(ids)).toThrow('WORKBENCH_PANEL_ITEMS_INVALID');
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  cleanups.push(() => root.unmount());
  await act(async () => root.render(<AgentUILocaleProvider locale="en-US">
    <WorkbenchPanelActions service={service} />
    <WorkbenchPanel service={service}><input data-testid="main-draft" /></WorkbenchPanel>
  </AgentUILocaleProvider>));
  expect(container.querySelector('[data-testid="main-draft"]')).not.toBeNull();
  expect(container.querySelectorAll('[role="tab"], textarea, [data-ui-plugin="workbench-panel-actions"]')).toHaveLength(0);
  expect(container.querySelector<HTMLButtonElement>('.workbench-panel-toggle')?.disabled).toBe(true);
});

it('exposes stable observable state, preserves the selection when collapsed and isolates Agents', () => {
  const first = createWorkbenchPanelService(contentIds);
  const second = createWorkbenchPanelService(contentIds);
  const changed = vi.fn();
  const dispose = first.subscribe(changed);
  const initial = first.getSnapshot();
  first.collapse();
  expect(first.getSnapshot()).toBe(initial);
  first.open('content-b');
  expect(first.getSnapshot()).toMatchObject({ open: true, activeItemId: 'content-b' });
  const opened = first.getSnapshot();
  first.open('content-b');
  expect(first.getSnapshot()).toBe(opened);
  first.collapse();
  expect(first.getSnapshot()).toMatchObject({ open: false, activeItemId: 'content-b' });
  first.open();
  expect(first.getSnapshot()).toMatchObject({ open: true, activeItemId: 'content-b' });
  expect(second.getSnapshot()).toMatchObject({ open: false, activeItemId: 'content-a' });
  expect(() => first.open('missing')).toThrow('WORKBENCH_PANEL_ITEM_NOT_FOUND');
  expect(changed).toHaveBeenCalledTimes(3);
  dispose();
  first.activate('content-a');
  expect(changed).toHaveBeenCalledTimes(3);
});

it('closes individual tabs, selects a neighbour, collapses the last and restores closed items', () => {
  const service = createWorkbenchPanelService(['content-a', 'content-b', 'content-c']);
  service.open('content-b');
  service.close('content-a');
  expect(service.getSnapshot()).toEqual({ open: true, activeItemId: 'content-b', visibleItemIds: ['content-b', 'content-c'] });
  const unchanged = service.getSnapshot();
  service.close('content-a');
  expect(service.getSnapshot()).toBe(unchanged);
  service.close('content-b');
  expect(service.getSnapshot()).toEqual({ open: true, activeItemId: 'content-c', visibleItemIds: ['content-c'] });
  service.close('content-c');
  expect(service.getSnapshot()).toEqual({ open: false, activeItemId: 'content-c', visibleItemIds: [] });
  service.open();
  expect(service.getSnapshot()).toEqual({ open: true, activeItemId: 'content-c', visibleItemIds: ['content-c'] });
  service.open('content-a');
  service.close('content-a');
  expect(service.getSnapshot().activeItemId).toBe('content-c');
  expect(() => service.close('missing')).toThrow('WORKBENCH_PANEL_ITEM_NOT_FOUND');
});

it('keeps main and every content subtree mounted across external calls, tab keys and collapse', async () => {
  const service = createWorkbenchPanelService(contentIds);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(() => container.remove(), () => root.unmount());
  await act(async () => root.render(<AgentUILocaleProvider locale="en-US">
    <WorkbenchPanelActions service={service} items={contentItems} />
    <WorkbenchPanel service={service} items={contentItems}><input aria-label="conversation-draft" /></WorkbenchPanel>
  </AgentUILocaleProvider>));
  const main = container.querySelector<HTMLInputElement>('[aria-label="conversation-draft"]')!;
  const notes = container.querySelectorAll('textarea')[0]!;
  const details = container.querySelectorAll('textarea')[1]!;
  main.value = 'keep conversation draft';
  const openDetails = container.querySelectorAll<HTMLButtonElement>('[data-ui-plugin="workbench-panel-actions"] button')[1]!;
  await act(async () => openDetails.click());
  const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
  await act(async () => {
    tabs[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  });
  expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(tabs[0]);
  await act(async () => container.querySelector<HTMLButtonElement>('.workbench-panel-collapse')!.click());
  expect(container.querySelector<HTMLElement>('aside')!.hidden).toBe(true);
  expect(main.isConnected && notes.isConnected && details.isConnected).toBe(true);
  expect(main.value).toBe('keep conversation draft');
  const restore = container.querySelector<HTMLButtonElement>('.workbench-panel-restore')!;
  await act(async () => { restore.focus(); restore.click(); });
  expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(restore);
  expect(container.querySelector('.workbench-panel-toggle')).toBe(restore);
  await act(async () => service.open('content-b'));
  expect(container.querySelectorAll('textarea')[0]).toBe(notes);
  expect(container.querySelectorAll('textarea')[1]).toBe(details);
  expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Close Content B"]')!.click());
  expect(container.querySelectorAll('[role="tab"]')).toHaveLength(1);
  expect(document.activeElement).toBe(tabs[0]);
  expect(container.querySelectorAll('textarea')[1]).toBe(details);
  await act(async () => container.querySelector<HTMLButtonElement>('[role="tab"]')!
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })));
  expect(service.getSnapshot().open).toBe(false);
  expect(document.activeElement).toBe(restore);
  expect(main.isConnected && notes.isConnected && details.isConnected).toBe(true);
  await act(async () => restore.click());
  expect(container.querySelectorAll('textarea')[1]).toBe(details);
  expect(container.querySelectorAll('[role="tab"]')).toHaveLength(1);
  expect(service.getSnapshot().activeItemId).toBe('content-a');
});

it('uses controlled props and callbacks without replacing the main subtree', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  cleanups.push(() => container.remove(), () => root.unmount());
  const onOpenChange = vi.fn(), onActiveItemChange = vi.fn(), onVisibleItemsChange = vi.fn();
  await act(async () => root.render(<WorkbenchPanel items={contentItems} open activeItemId="content-a"
    onOpenChange={onOpenChange} onActiveItemChange={onActiveItemChange}
    visibleItemIds={contentIds} onVisibleItemsChange={onVisibleItemsChange}>main</WorkbenchPanel>));
  await act(async () => container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!.click());
  expect(onActiveItemChange).toHaveBeenCalledWith('content-b');
  expect(onOpenChange).toHaveBeenCalledWith(true);
  await act(async () => container.querySelector<HTMLButtonElement>('.workbench-panel-collapse')!.click());
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
  await act(async () => container.querySelector<HTMLButtonElement>('.workbench-panel-tab-close')!.click());
  expect(onVisibleItemsChange).toHaveBeenCalledWith(['content-b']);
  expect(onActiveItemChange).toHaveBeenLastCalledWith('content-b');
  expect(container.querySelectorAll('[role="tab"]')).toHaveLength(2);
});

it('enables the feature only in the platform Bootstrap preset', () => {
  const registry = createDefaultAgentUIPresetRegistry(value => value);
  for (const mode of ['platform', 'assistant', 'embedded'] as const) {
    const preset = registry.get(`${mode}/default`)!;
    const model = JSON.stringify(preset.createAppUIModel());
    expect(model.includes('workbench-panel')).toBe(mode === 'platform');
    expect(model.includes('workbench-panel-actions')).toBe(false);
    expect(model.includes('content-a')).toBe(false);
    expect(model.includes('content-b')).toBe(false);
    expect(preset.sourceItems?.includes('plugin/workbench-panel')).toBe(mode === 'platform');
  }
});
