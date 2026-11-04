import { CanonicalConversationSurfacePlugin as Implementation } from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import { ConversationAdapter, ConversationWelcomeFallback } from '@za38.03/agent-ui-runtime/ui';
import { useConversationRendererSlots } from '@za38.03/agent-ui-runtime/ui/agent-ui/conversation/useConversationRendererSlots';
import type { ComponentProps } from 'react';
import { useConversations } from '../../services/hooks/useConversations';
import './styles.css';

export function ConversationSurfacePlugin(
  props: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>,
) {
  const rendererSlots = useConversationRendererSlots();
  const { snapshot } = useConversations();
  return (
    <Implementation
      Adapter={ConversationAdapter}
      rendererSlots={rendererSlots}
      snapshot={snapshot}
      welcome={<ConversationWelcomeFallback />}
      {...props}
    />
  );
}
