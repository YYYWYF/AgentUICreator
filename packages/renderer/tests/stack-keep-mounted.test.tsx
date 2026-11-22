// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { LayoutRenderer, type StackNode } from '../src/index.js';

it('renders controlled Stack views and preserves hidden DOM, component state and focus isolation', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host), mount = vi.fn(), unmount = vi.fn();
  function Chat() { useEffect(() => { mount(); return unmount; }, []); return <textarea defaultValue='initial' />; }
  const stack: StackNode = { type: 'stack', id: 'main', keepMounted: true, viewIds: ['chat', 'files'],
    children: [{ type: 'slot', id: 'chat-slot', slotId: 'chat' }, { type: 'slot', id: 'files-slot', slotId: 'files' }] };
  const render = (id: string) => <LayoutRenderer root={stack} stackActiveViews={{ main: id }}
    renderSlot={slot => slot.slotId === 'chat' ? <Chat /> : <p>Files</p>} />;
  try {
    await act(async () => root.render(render('chat')));
    const textarea = host.querySelector('textarea')!; textarea.value = 'unsent draft';
    await act(async () => root.render(render('files')));
    const chat = host.querySelector<HTMLElement>('[data-stack-view="chat"]')!;
    expect(chat.hidden).toBe(true); expect(chat.hasAttribute('inert')).toBe(true);
    expect(textarea.isConnected).toBe(true);
    await act(async () => root.render(render('chat')));
    expect(host.querySelector('textarea')).toBe(textarea);
    expect(textarea.value).toBe('unsent draft');
    expect(mount).toHaveBeenCalledTimes(1); expect(unmount).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
