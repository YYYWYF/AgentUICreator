import { ConversationNewPlugin as Implementation } from '@za38.03/agent-ui-plugins/conversation-new';
import { CirclePlus } from 'lucide-react';
import type { ComponentProps } from 'react';

export function ConversationNewPlugin(props: ComponentProps<typeof Implementation>) {
  return (
    <Implementation
      showLabel={false}
      children={<CirclePlus aria-hidden='true' style={{ width: 20, height: 20, color: 'var(--muted-foreground)' }} />}
      {...props}
    />
  );
}
