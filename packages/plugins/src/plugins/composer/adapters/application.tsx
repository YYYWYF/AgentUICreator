import { ConversationComposerPlugin as Composer } from '@za38.03/agent-ui-plugins/composer';
import type { ComponentProps } from 'react';
import { requestAdapter } from './request-adapter';

export function ConversationComposerPlugin(props: ComponentProps<typeof Composer>) {
  return <Composer {...props} requestAdapter={props.requestAdapter ?? requestAdapter} />;
}
