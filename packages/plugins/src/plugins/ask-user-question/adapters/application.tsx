import { AskUserQuestionPlugin as Implementation } from '@za38.03/agent-ui-plugins/ask-user-question';
import type { ComponentProps } from 'react';

export function AskUserQuestionPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} />;
}
