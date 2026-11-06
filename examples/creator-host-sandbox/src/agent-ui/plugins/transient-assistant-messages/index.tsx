import { TransientAssistantMessagesPlugin as Implementation } from '@za38.03/agent-ui-plugins/transient-assistant-messages';
import type { ComponentProps } from 'react';
import { usePluginRenderScope } from '@za38.03/agent-ui-plugins';

export const TransientAssistantMessagesPlugin = (props: ComponentProps<typeof Implementation>) => {
  const scope = usePluginRenderScope<Partial<ComponentProps<typeof Implementation>>>();
  if (scope?.kind !== 'conversation.transient-messages') {
    return null;
  }
  return <Implementation {...scope.value} {...props} />;
};
