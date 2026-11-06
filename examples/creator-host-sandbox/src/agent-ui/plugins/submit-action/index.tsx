import { ConversationSubmitActionPlugin as Implementation } from '@za38.03/agent-ui-plugins/submit-action';
import type { ComponentProps } from 'react';

export const ConversationSubmitActionPlugin = (props: ComponentProps<typeof Implementation>) => {
  return <Implementation {...props} />;
};
