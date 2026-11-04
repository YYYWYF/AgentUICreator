import { ConversationThreadListPlugin as Implementation } from '@za38.03/agent-ui-plugins/conversation-thread-list';
import { useAgentRun } from '@za38.03/agent-ui-runtime';
import { useAgentUITheme } from '@za38.03/agent-ui-runtime/ui';
import type { ComponentProps } from 'react';
import { useConversationActions } from '../../services/hooks/useConversationActions';
import { useConversations } from '../../services/hooks/useConversations';

export function ConversationThreadListPlugin(props: ComponentProps<typeof Implementation>) {
  const { snapshot, serviceAvailable } = useConversations();
  const { refresh } = useConversationActions();
  const theme = useAgentUITheme();
  const run = useAgentRun();
  return (
    <Implementation
      snapshot={snapshot}
      serviceAvailable={serviceAvailable}
      onRefresh={refresh}
      theme={theme}
      runStatus={run.status}
      {...props}
      headerActions={
        props.renderSlot ? props.renderSlot('headerActions', props.headerActions ?? null) : props.headerActions
      }
    />
  );
}
