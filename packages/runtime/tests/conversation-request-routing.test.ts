import { expect, it } from 'vitest';
import { restoreConversationSendOptions, withConversationSendOptions } from '../src/compatibility/conversation-request-routing.js';

it('restores a temporary route while preserving concurrent draft configuration', () => {
  const original = { custom: { draft: 'first' } };
  const submitted = withConversationSendOptions(original, { endpoint: '/workflow', ctx: { orderId: '42' } });
  const current = { custom: { ...submitted.custom, draft: 'next' } };
  expect(restoreConversationSendOptions(current, submitted, original)).toEqual({ custom: { draft: 'next' } });
  expect(restoreConversationSendOptions(submitted, submitted, original)).toBe(original);
});

it('preserves a newer routing scope and restores an earlier scope when unchanged', () => {
  const original = withConversationSendOptions({ custom: { draft: 'first' } }, { endpoint: '/original' });
  const submitted = withConversationSendOptions(original, { endpoint: '/workflow' });
  const current = withConversationSendOptions(submitted, { endpoint: '/next' });
  expect(restoreConversationSendOptions(current, submitted, original)).toBe(current);
  expect(restoreConversationSendOptions({ custom: { ...submitted.custom, draft: 'next' } }, submitted, original))
    .toEqual({ custom: { ...original.custom, draft: 'next' } });
});
