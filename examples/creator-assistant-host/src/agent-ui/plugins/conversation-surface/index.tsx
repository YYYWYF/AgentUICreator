import { ConversationSurfacePlugin as Implementation } from '@za38.03/agent-ui-plugins/conversation-surface';
import { ConversationAdapter } from '@za38.03/agent-ui-runtime/ui';
import { useConversationRendererSlots } from '@za38.03/agent-ui-runtime/ui/agent-ui/conversation/useConversationRendererSlots';
import type { ComponentProps } from 'react';
import { useConversations } from '../../services/hooks/useConversations';

export function ConversationSurfacePlugin(props: ComponentProps<typeof Implementation>) {
  const rendererSlots = useConversationRendererSlots();
  const { snapshot } = useConversations();
  return (
    <Implementation
      Adapter={ConversationAdapter}
      rendererSlots={rendererSlots}
      snapshot={snapshot}
      {...props}
    />
  );
}
