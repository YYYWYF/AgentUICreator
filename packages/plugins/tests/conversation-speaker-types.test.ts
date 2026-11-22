import { expectTypeOf, it } from 'vitest';
import type {
  ConversationMessageView,
  ConversationState,
  ConversationThreadController,
  ConversationThreadSnapshot,
  MessageIdentityOptions,
  MessageSpeaker,
} from '../dist/index.js';

it('ships precise speaker types for scoped messages, lists and imperative snapshots', () => {
  expectTypeOf<MessageSpeaker>().not.toBeAny();
  expectTypeOf<MessageIdentityOptions>().not.toBeAny();
  expectTypeOf<MessageSpeaker['id']>().toEqualTypeOf<string>();
  expectTypeOf<MessageSpeaker['name']>().toEqualTypeOf<string>();
  expectTypeOf<MessageSpeaker['avatarUrl']>().toEqualTypeOf<string | undefined>();
  expectTypeOf<ConversationState['message']['speaker']>().toEqualTypeOf<MessageSpeaker | null | undefined>();
  expectTypeOf<ConversationThreadSnapshot['messages'][number]>().toEqualTypeOf<ConversationMessageView>();
  expectTypeOf<ReturnType<ConversationThreadController['getSnapshot']>['messages'][number]['speaker']>()
    .toEqualTypeOf<MessageSpeaker | null | undefined>();
});
