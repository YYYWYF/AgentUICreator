import { ConversationAddAttachmentActionPlugin as Implementation } from '@za38.03/agent-ui-plugins/add-attachment-action';
import type { ComponentProps } from 'react';

export const ConversationAddAttachmentActionPlugin = (props: ComponentProps<typeof Implementation>) => {
  return <Implementation {...props} />;
};
