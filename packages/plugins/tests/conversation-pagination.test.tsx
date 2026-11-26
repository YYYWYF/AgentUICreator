import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAui, type AssistantRuntime } from '@assistant-ui/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentUIRoot, AgentUILocaleProvider } from '@za38.03/agent-ui-plugins';
import { ConversationRuntimeProvider } from '@za38.03/agent-ui-runtime';
import { createConversationService } from '../src/plugins/conversation-service/adapters/presentation/service';
import { createConversationServiceThreadBinding } from '../src/plugins/conversation-service/adapters/presentation/thread-binding';
import { createEmptyConversationDataSource } from '../src/plugins/conversation-service/adapters/presentation/data-source';
import { CanonicalConversationThreadList } from '../src/plugins/conversation-thread-list/adapters/presentation/conversation-thread-list';
import { createConversationDataSource } from '../resources/registry/items/foundation/core-application/files/services/conversations/data-source';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let dispose: (() => void) | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  dispose?.();
  root = undefined;
  dispose = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100 && !predicate(); i++)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  expect(predicate()).toBe(true);
}

async function fixture(locale: 'en-US' | 'zh-CN' = 'en-US', terminal = false) {
  const intersectionObserver = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor() { intersectionObserver(); }
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value() {} });
  const cursors = ['next+/= 中文', 'last&cursor'];
  let fail = false;
  let pageGate: Promise<void> | undefined;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input), 'https://test.local');
    if (init?.method !== 'GET') return new Response(null, { status: 204 });
    const cursor = url.searchParams.get('cursor');
    if (cursor !== null) await pageGate;
    if (fail && cursor !== null) throw new Error('Page unavailable');
    const page = cursor === null ? 0 : cursors.indexOf(cursor) + 1;
    if (page === 0 && url.pathname !== '/history/conversations') return Response.json({
      returnCode: 'SUC0000', body: { thread_id: 'a', title: 'A', max_message_checkpoint: { channel_values: { messages: [] } } },
    });
    const ids = page === 0 ? ['a'] : page === 1 ? ['a', 'b'] : ['c'];
    return Response.json({ returnCode: 'SUC0000', body: {
      conversations: ids.map((id) => ({
        thread_id: id, title: id.toUpperCase(),
        last_message_time: `2026-09-0${id === 'a' ? 7 : id === 'b' ? 8 : 9}T12:00:00Z`,
      })),
      next_cursor: terminal ? null : cursors[page] ?? null,
    } });
  });
  const service = createConversationService({ dataSource: createConversationDataSource({ endpoint: '/history', fetch }) });
  const binding = createConversationServiceThreadBinding(undefined, 'a');
  const detach = binding.attachConversationService(service);
  dispose = () => { detach(); service.dispose(); };
  await service.refresh();
  let runtime!: AssistantRuntime;
  function List() {
    runtime = useAui().threads.__internal_getAssistantRuntime!();
    const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot);
    return <CanonicalConversationThreadList snapshot={snapshot} onRefresh={service.refresh} serviceAvailable />;
  }
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <ConversationRuntimeProvider endpoint='https://test.local/agent' threadBinding={binding}>
      <AgentUIRoot theme='light'><AgentUILocaleProvider locale={locale}><List /></AgentUILocaleProvider></AgentUIRoot>
    </ConversationRuntimeProvider>,
  ));
  await until(() => !!runtime && !runtime.threads.getState().isLoading);
  const listRequests = () => fetch.mock.calls.filter(([url]) => new URL(String(url), 'https://test.local').pathname === '/history/conversations');
  return {
    service, binding, fetch, host, runtime, cursors, listRequests, intersectionObserver,
    setFail(value: boolean) { fail = value; },
    setPageGate(value: Promise<void>) { pageGate = value; },
    async resizeAndScroll() {
      await act(async () => {
        host.style.height = '80px';
        const list = host.querySelector<HTMLElement>('[data-slot="aui_thread-list-items"]')!;
        list.scrollTop = list.scrollHeight;
        list.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
      });
    },
    async clickLoadMore() {
      const button = host.querySelector<HTMLButtonElement>('[data-slot="agent-ui-thread-list-load-more"]');
      if (!button) throw new Error('Missing load more button');
      await act(async () => { button.click(); button.click(); });
    },
  };
}

it('loads native pages only on click, preserves the tail across refresh/reload, and stops at null', async () => {
  const f = await fixture();
  const reload = vi.spyOn(f.runtime.threads, 'reload');
  expect(f.host.querySelector('[data-slot="agent-ui-thread-list-load-more"]')?.closest('[data-slot="aui_thread-list-items"]')).not.toBeNull();
  await f.resizeAndScroll();
  expect(f.intersectionObserver).not.toHaveBeenCalled();
  expect(f.listRequests()).toHaveLength(1);
  await f.clickLoadMore();
  await until(() => f.service.getSnapshot().conversations.length === 2 && !f.runtime.threads.getState().isLoadingMore);
  expect(reload).not.toHaveBeenCalled();
  expect(f.runtime.threads.getState().threadIds).toHaveLength(2);
  expect([...f.host.querySelectorAll('[data-slot="aui_thread-list-item-title"]')].map(node => node.textContent))
    .toEqual(['A', 'B']);
  expect(f.service.getSnapshot().nextCursor).toBe(f.cursors[1]);

  await act(async () => { await f.runtime.threads.reload(); });
  expect(f.listRequests()).toHaveLength(2);
  await act(async () => { await f.service.refresh(); });
  await until(() => !f.runtime.threads.getState().isLoading);
  expect(f.runtime.threads.getState().threadIds).toHaveLength(2);
  expect(f.service.getSnapshot().nextCursor).toBe(f.cursors[1]);
  await f.clickLoadMore();
  await until(() => !f.runtime.threads.getState().hasMore);
  expect(f.service.getSnapshot().conversations.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  expect([...f.host.querySelectorAll('[data-slot="aui_thread-list-item-title"]')].map(node => node.textContent))
    .toEqual(['A', 'B', 'C']);
  expect(f.service.getSnapshot().nextCursor).toBeNull();
  expect(f.listRequests().map(([url]) => new URL(String(url), 'https://test.local').searchParams.get('cursor')))
    .toEqual([null, f.cursors[0], null, f.cursors[1]]);
  const count = f.listRequests().length;
  expect(f.host.querySelector('[data-slot="agent-ui-thread-list-load-more"]')).toBeNull();
  await f.resizeAndScroll();
  await act(async () => { await f.runtime.threads.loadMore(); });
  expect(f.listRequests()).toHaveLength(count);
  expect(f.runtime.threads.mainItem.getState().remoteId).toBe('a');
});

it('disables load more while a page is pending and never queues an automatic next page', async () => {
  const f = await fixture();
  let release!: () => void;
  f.setPageGate(new Promise<void>((resolve) => { release = resolve; }));
  try {
    await f.clickLoadMore();
    await until(() => f.runtime.threads.getState().isLoadingMore);
    const button = f.host.querySelector<HTMLButtonElement>('[data-slot="agent-ui-thread-list-load-more"]')!;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    await f.clickLoadMore();
    await f.resizeAndScroll();
    expect(f.listRequests()).toHaveLength(2);
  } finally {
    await act(async () => { release(); });
  }
  await until(() => !f.runtime.threads.getState().isLoadingMore);
  expect(f.listRequests()).toHaveLength(2);
  expect(f.host.querySelector<HTMLButtonElement>('[data-slot="agent-ui-thread-list-load-more"]')?.disabled).toBe(false);
});

it('does not request another page when the first response has a null cursor', async () => {
  const f = await fixture('en-US', true);
  expect(f.host.querySelector('[data-slot="agent-ui-thread-list-load-more"]')).toBeNull();
  await f.resizeAndScroll();
  await act(async () => { await f.runtime.threads.loadMore(); });
  expect(f.listRequests()).toHaveLength(1);
  expect(f.service.getSnapshot().nextCursor).toBeNull();
  expect(f.runtime.threads.getState().hasMore).toBe(false);
});

it('preserves pagination through rename, archive, unarchive and delete', async () => {
  const f = await fixture();
  await f.clickLoadMore();
  await until(() => f.runtime.threads.getState().threadIds.length === 2);
  await act(async () => { await f.runtime.threads.getItemById('b').rename('Renamed'); });
  await act(async () => { await f.runtime.threads.getItemById('b').archive(); });
  await act(async () => { await f.runtime.threads.getItemById('b').unarchive(); });
  await act(async () => { await f.runtime.threads.getItemById('b').delete(); });
  expect(f.service.getSnapshot().nextCursor).toBe(f.cursors[1]);
  expect(f.runtime.threads.getState().hasMore).toBe(true);
  expect(f.runtime.threads.getState().threadIds).toHaveLength(1);
  await f.clickLoadMore();
  await until(() => !f.runtime.threads.getState().hasMore);
  expect(f.service.getSnapshot().conversations.map((item) => item.id)).toEqual(['a', 'c']);
  expect(new URL(String(f.listRequests().at(-1)![0]), 'https://test.local').searchParams.get('cursor')).toBe(f.cursors[1]);
});

it.each(['en-US', 'zh-CN'] as const)('%s keeps existing rows and the cursor after a failed page, then retries it', async (locale) => {
  const f = await fixture(locale);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(f.host.querySelector('[data-slot="agent-ui-thread-list-load-more"]')?.textContent).toBe(locale === 'zh-CN' ? '加载更多' : 'Load more');
  f.setFail(true);
  await f.clickLoadMore();
  await until(() => !!f.host.querySelector('[role="alert"]') && !f.runtime.threads.getState().isLoadingMore);
  expect(f.service.getSnapshot().conversations).toHaveLength(1);
  expect(f.service.getSnapshot().nextCursor).toBe(f.cursors[0]);
  expect(f.runtime.threads.getState().hasMore).toBe(true);
  await f.resizeAndScroll();
  expect(f.listRequests()).toHaveLength(2);
  const button = f.host.querySelector<HTMLButtonElement>('[data-slot="agent-ui-thread-list-load-more"]')!;
  expect(button.textContent).toBe(locale === 'zh-CN' ? '重试' : 'Retry');
  f.setFail(false);
  await act(async () => { button.click(); });
  await until(() => f.service.getSnapshot().conversations.length === 2);
  expect(f.listRequests().slice(1).map(([url]) => new URL(String(url), 'https://test.local').searchParams.get('cursor')))
    .toEqual([f.cursors[0], f.cursors[0]]);
});

it('aborts a pending page on refresh and rejects late results without changing the cursor', async () => {
  let finish: ((value: { conversations: { id: string; title: string }[]; nextCursor: null }) => void) | undefined;
  let signal: AbortSignal | undefined;
  const service = createConversationService({ dataSource: {
    ...createEmptyConversationDataSource(),
    list: async (options) => {
      if (!options?.cursor) return { conversations: [{ id: 'a', title: 'A' }], nextCursor: 'next' };
      signal = options.signal;
      return new Promise((resolve) => { finish = resolve; });
    },
  } });
  dispose = service.dispose;
  await service.refresh();
  const pending = service.loadPage!('next');
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await service.refresh();
  expect(signal?.aborted).toBe(true);
  finish!({ conversations: [{ id: 'late', title: 'Late' }], nextCursor: null });
  await rejected;
  expect(service.getSnapshot().conversations.map((item) => item.id)).toEqual(['a']);
  expect(service.getSnapshot().nextCursor).toBe('next');
});
