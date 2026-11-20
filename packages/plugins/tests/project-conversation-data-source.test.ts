import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  conversationConnection,
  createConversationDataSource} from '../resources/registry/items/foundation/core-application/files/services/conversations/data-source';
import * as dataSourcePlugin from '../dist/conversation-data-source/index.js';
import { projectConversationDetail as npmProjector } from '../dist/conversation-service/index.js';
import { projectConversationDetail as sourceProjector } from '../dist/sources/takeover/conversation-service/index';

const detail = {
  id: '中文/id', title: 'Saved',
  history: { format: 'langchain' as const, messages: [
    { id: 'user', type: 'human', content: '<think>User literal</think>' },
    { id: 'answer', type: 'ai', content: '<think>Saved reasoning</think>Answer' },
    { id: 'empty', type: 'ai', content: '<think>' },
  ] },
  agentState: { selected: 'explicit state' },
};
const backendDetail = {
  returnCode: 'SUC0000', errorMsg: null,
  body: {
    thread_id: detail.id, title: detail.title,
    max_message_checkpoint: { channel_values: { messages: detail.history.messages } },
    agentState: detail.agentState,
  },
};
const backendList = {
  returnCode: 'SUC0000', errorMsg: null,
  body: { total_conversations: 1, conversations: [{ thread_id: detail.id, title: detail.title, status: 'archived' }] },
};
afterEach(() => { conversationConnection.headers = () => ({}); conversationConnection.credentials = 'same-origin'; });

it('executes all six project methods with encoded identities, rotating auth and cancellation', async () => {
  let token = 'first';
  conversationConnection.headers = () => ({ Authorization: `Bearer ${token}` });
  conversationConnection.credentials = 'include';
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json(backendList))
    .mockResolvedValueOnce(Response.json(backendDetail))
    .mockImplementation(async () => new Response(null, { status: 204 }));
  const source = createConversationDataSource({ endpoint: 'https://business.test/api/', fetch });
  const signal = new AbortController().signal;
  expect(await source.list({ signal })).toEqual([{ id: detail.id, title: detail.title, status: 'archived' }]);
  token = 'second';
  expect(await source.get(detail.id, { signal })).toEqual(detail);
  await source.delete(detail.id, { signal });
  await source.rename!(detail.id, 'Renamed', { signal });
  await source.archive!(detail.id, { signal });
  await source.unarchive!(detail.id, { signal });
  const url = `https://business.test/api/conversations/${encodeURIComponent(detail.id)}`;
  expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
    ['https://business.test/api/conversations', 'GET'], [url, 'GET'], [url, 'DELETE'],
    [url, 'PATCH'], [`${url}/archive`, 'POST'], [`${url}/unarchive`, 'POST'],
  ]);
  expect(fetch.mock.calls.every(([, init]) => init?.signal === signal && init.credentials === 'include')).toBe(true);
  expect(fetch.mock.calls.map(([, init]) => new Headers(init?.headers).get('authorization'))).toEqual(['Bearer first', ...Array<string>(5).fill('Bearer second')]);
  expect(fetch.mock.calls[3]?.[1]?.body).toBe(JSON.stringify({ title: 'Renamed' }));
  expect(new Headers(fetch.mock.calls[3]?.[1]?.headers).get('content-type')).toBe('application/json');
});

it('isolates endpoint and transport bindings between Agent instances', async () => {
  const leftFetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(backendList));
  const rightFetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(backendList));
  await Promise.all([
    createConversationDataSource({ endpoint: '/left', fetch: leftFetch }).list(),
    createConversationDataSource({ endpoint: '/right', fetch: rightFetch }).list(),
  ]);
  expect(leftFetch.mock.calls[0]?.[0]).toBe('/left/conversations');
  expect(rightFetch.mock.calls[0]?.[0]).toBe('/right/conversations');
});

it('rejects HTTP errors, invalid results and a mismatched conversation', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
    .mockResolvedValueOnce(Response.json({ conversations: [] }))
    .mockResolvedValueOnce(Response.json({ ...backendDetail, body: { ...backendDetail.body, thread_id: 'other' } }))
    .mockResolvedValueOnce(Response.json({ ...backendDetail, body: { ...backendDetail.body, max_message_checkpoint: { channel_values: { messages: 'invalid' } } } }));
  const source = createConversationDataSource({ endpoint: '/api', fetch });
  await expect(source.delete('id')).rejects.toThrow('403');
  await expect(source.list()).rejects.toThrow();
  await expect(source.get(detail.id)).rejects.toThrow('CONVERSATION_ID_MISMATCH');
  await expect(source.get(detail.id)).rejects.toThrow();
});

it('maps backend list fields and omits empty timestamps and statistics', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
    returnCode: 'SUC0000', body: { total_conversations: 4, conversations: [
      { thread_id: '1', title: 'One', last_message_time: ' 2026-11-16T08:00:00Z ', message_count: 2 },
      { thread_id: '2', title: 'Two', last_message_time: '' },
      { thread_id: '3', title: 'Three', last_message_time: null },
      { thread_id: '4', title: 'Four' },
    ] },
  }));
  expect(await createConversationDataSource({ endpoint: '/api', fetch }).list()).toEqual([
    { id: '1', title: 'One', updatedAt: '2026-11-16T08:00:00Z' },
    { id: '2', title: 'Two' }, { id: '3', title: 'Three' }, { id: '4', title: 'Four' },
  ]);
});

it.each([
  { thread_id: '', title: 'Saved' },
  { thread_id: 'id', title: ' ' },
  { thread_id: 'id', title: 'Saved', status: 'unknown' },
  { thread_id: 'id', title: 'Saved', last_message_time: 123 },
  null,
])('rejects invalid backend list entries', async item => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
    returnCode: 'SUC0000', body: { conversations: [item] },
  }));
  await expect(createConversationDataSource({ endpoint: '/api', fetch }).list()).rejects.toThrow();
});

it('preserves tool and multimodal message fields when converting the backend response', async () => {
  const messages = [
    { id: 'user', type: 'human', content: [{ type: 'image_url', image_url: { url: 'https://example.test/image.png' } }] },
    { id: 'call', type: 'ai', content: '', tool_calls: [{ id: 'tool-1', name: 'search', args: { query: 'saved' } }] },
    { id: 'result', type: 'tool', content: 'Result', tool_call_id: 'tool-1' },
  ];
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
    ...backendDetail, body: { ...backendDetail.body, max_message_checkpoint: { channel_values: { messages } } },
  }));
  expect((await createConversationDataSource({ endpoint: '/api', fetch }).get(detail.id)).history.messages).toEqual(messages);
});

it.each([
  { channel_values: { messages: detail.history.messages } },
  { channel_values: { messages: detail.history.messages }, values: { messages: [] } },
  { channel_values: { messages: detail.history.messages }, values: null },
])('restores messages only from checkpoint channel_values', async checkpoint => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
    returnCode: 'SUC0000', body: { thread_id: detail.id, max_message_checkpoint: checkpoint },
  }));
  expect(await createConversationDataSource({ endpoint: '/api', fetch }).get(detail.id)).toEqual({
    id: detail.id, title: detail.id, history: detail.history,
  });
});

it('restores an empty history without inferring agentState from checkpoint business fields', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
    returnCode: 'SUC0000', body: {
      thread_id: detail.id, max_message_checkpoint: { channel_values: { selected: 'business state' } },
    },
  }));
  expect(await createConversationDataSource({ endpoint: '/api', fetch }).get(detail.id)).toEqual({
    id: detail.id, title: detail.id, history: { format: 'langchain', messages: [] },
  });
});

it.each(['list', 'get'] as const)('rejects backend business errors in %s even with HTTP 200', async method => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
    returnCode: 'FAIL001', errorMsg: 'Business failure', body: null,
  }));
  const source = createConversationDataSource({ endpoint: '/api', fetch });
  await expect(method === 'list' ? source.list() : source.get(detail.id)).rejects.toThrow('FAIL001: Business failure');
});

it.each([
  {}, { values: { messages: detail.history.messages } },
  { channel_values: null, values: { messages: detail.history.messages } },
  { channel_values: { messages: null }, values: { messages: detail.history.messages } },
  { channel_values: {}, tasks: 'invalid' },
])('rejects invalid checkpoints instead of silently returning empty history', async checkpoint => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
    returnCode: 'SUC0000', body: { thread_id: detail.id, max_message_checkpoint: checkpoint },
  }));
  await expect(createConversationDataSource({ endpoint: '/api', fetch }).get(detail.id)).rejects.toThrow();
});

describe.each([['npm', npmProjector], ['owned source', sourceProjector]] as const)('%s service history', (_name, project) => {
  it('retains canonical history conversion after removing the HTTP factory', () => {
    expect(project(detail)).toMatchObject([
      { id: 'user', role: 'user', content: [{ type: 'text', text: '<think>User literal</think>' }] },
      { id: 'answer', role: 'assistant', content: [{ type: 'reasoning', text: 'Saved reasoning' }, { type: 'text', text: 'Answer' }] },
    ]);
  });
});

it('does not expose an npm HTTP factory', () => {
  expect(dataSourcePlugin).not.toHaveProperty('createHttpConversationDataSource');
});
