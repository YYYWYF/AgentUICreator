import { createContext, useContext, useState, type ReactNode } from 'react';
import { useAuiState } from '@assistant-ui/react';
import { useConversation } from '../../../../public.js';
import { BotIcon } from '../../../../plugin-support.js';
import { parseMessageSpeaker, type MessageSpeaker } from './message-speaker.js';
export type { MessageSpeaker } from './message-speaker.js';

export interface MessageIdentityOptions {
  readonly fallback?: MessageSpeaker;
  readonly render?: (props: { speaker: MessageSpeaker; messageId: string }) => ReactNode;
}

export const MessageIdentityContext = createContext<false | MessageIdentityOptions | undefined>(undefined);

function SpeakerAvatar({ url }: { url?: string }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return <span data-slot='assistant-message-avatar' style={{ display: 'inline-flex', width: 28, height: 28, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', overflow: 'hidden' }}>
    {url && url !== failedUrl
      ? <img src={url} alt='' onError={() => setFailedUrl(url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      : <BotIcon aria-hidden='true' size={20} />}
  </span>;
}

export function AssistantMessageIdentity() {
  const options = useContext(MessageIdentityContext);
  const speaker = useConversation(state => state.message.speaker);
  const messageId = useAuiState(state => state.message.id);
  const index = useAuiState(state => state.message.index);
  const previousSpeaker = useConversation(state => {
    const message = state.thread.messages[index - 1];
    return message?.role === 'assistant' ? message.speaker : null;
  });
  if (options === false || speaker === null) return null;
  const fallback = parseMessageSpeaker(options?.fallback);
  const current = speaker ?? fallback;
  if (!current) return null;
  const preceding = previousSpeaker === null ? undefined : previousSpeaker ?? fallback;
  if (preceding?.id === current.id && preceding.name === current.name && preceding.avatarUrl === current.avatarUrl) return null;
  return <div data-agent-ui-owned='' data-slot='assistant-message-identity' data-speaker-id={current.id}
    style={{ display: 'flex', alignItems: 'center', gap: 8, marginBlockEnd: 12, color: 'var(--foreground)' }}>
    {options?.render ? options.render({ speaker: current, messageId }) : <>
      <SpeakerAvatar {...(current.avatarUrl ? { url: current.avatarUrl } : {})} />
      <span data-slot='assistant-message-name' style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{current.name}</span>
    </>}
  </div>;
}
