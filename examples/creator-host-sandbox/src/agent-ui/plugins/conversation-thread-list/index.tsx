import { ConversationThreadListPlugin as Implementation } from '@za38.03/agent-ui-plugins/conversation-thread-list';
import { useAgentRuntime } from '@za38.03/agent-ui-runtime';
import { useTheme } from '@za38.03/agent-ui-runtime/ui';
import type { ComponentProps } from 'react';
import { useConversations } from '../../services/hooks/useConversations';

export function ConversationThreadListPlugin(props: ComponentProps<typeof Implementation>) {
  const { serviceAvailable, refresh } = useConversations();
  const snapshot = useConversations(state => state);
  const theme = useTheme();
  const runStatus = useAgentRuntime(snapshot => snapshot.run.status);
  return (
    <Implementation
      snapshot={snapshot}
      serviceAvailable={serviceAvailable}
      onRefresh={refresh}
      theme={theme}
      runStatus={runStatus}
      {...props}
      headerActions={
        props.renderSlot ? props.renderSlot('headerActions', props.headerActions ?? null) : props.headerActions
      }
    />
  );
}
