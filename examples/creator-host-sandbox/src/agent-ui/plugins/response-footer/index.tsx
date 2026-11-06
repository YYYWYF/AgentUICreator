import { ConversationResponseFooterPlugin as Implementation } from '@za38.03/agent-ui-plugins/response-footer';
import type { ComponentProps } from 'react';

export const ConversationResponseFooterPlugin = (props: ComponentProps<typeof Implementation>) => {
  return <Implementation {...props} />;
};
