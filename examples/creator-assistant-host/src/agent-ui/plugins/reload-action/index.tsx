import { ConversationReloadActionPlugin as Implementation } from '@za38.03/agent-ui-plugins/reload-action';
import type { ComponentProps } from 'react';

export const ConversationReloadActionPlugin = (props: ComponentProps<typeof Implementation>) => {
  return <Implementation {...props} />;
};
