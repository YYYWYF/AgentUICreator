import { ConversationComposerPlugin as Composer } from '@za38.03/agent-ui-plugins/composer';
import type { ComponentProps } from 'react';

export const ConversationComposerPlugin = (props: ComponentProps<typeof Composer>) => {
  return <Composer {...props} />;
};
